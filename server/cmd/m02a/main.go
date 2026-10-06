//go:build linux

// m02a is a private fixture benchmark, not an application server.
package main

import (
	"cardford/server/internal/compatibility"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"syscall"
	"time"
)

func must(e error) {
	if e != nil {
		panic(e)
	}
}

type counters struct {
	Checkpoints  int      `json:"checkpoints"`
	Transitions  int      `json:"transitions"`
	StateBytes   int      `json:"stateBytes"`
	ViewBytes    int      `json:"viewBytes"`
	FrameBytes   int      `json:"frameBytes"`
	FinalDigests []string `json:"finalDigests"`
}

func run() counters {
	b, e := os.ReadFile("web/server/tests/fixtures/legacy-module-document.json")
	must(e)
	var corpus struct {
		Cases []struct {
			Config   json.RawMessage
			Deal     []string
			Commands []json.RawMessage
		}
	}
	must(json.Unmarshal(b, &corpus))
	r := compatibility.Registry()
	ex, e := gamekernel.NewExecutor(r, gamekernel.DefaultLimits())
	must(e)
	c := counters{FinalDigests: []string{}}
	for _, s := range corpus.Cases {
		var config struct{ Mode string }
		must(json.Unmarshal(s.Config, &config))
		commands := s.Commands
		if config.Mode == "hearts" {
			commands = commands[:1]
		}
		result, e := ex.Replay(context.Background(), gamekernel.ReplayRequest{Mode: config.Mode, Config: s.Config, Deal: s.Deal, Commands: commands, Seats: []int{0, 1, 2, 3}}, func(f gamekernel.Frame) error {
			encoded, e := json.Marshal(f)
			if e != nil {
				return e
			}
			c.FrameBytes += len(encoded)
			c.StateBytes += len(f.State)
			for _, v := range f.Views {
				c.ViewBytes += len(v)
			}
			c.Checkpoints++
			return nil
		})
		must(e)
		c.Transitions += result.Transitions
		canonical, e := contracts.UTF16Canonical(result.Final.State)
		must(e)
		c.FinalDigests = append(c.FinalDigests, contracts.SHA256(canonical))
	}
	return c
}
func micros(t syscall.Timeval) float64 { return float64(t.Sec)*1e6 + float64(t.Usec) }
func main() {
	run()
	samples := []any{}
	var final counters
	for i := 0; i < 5; i++ {
		var before, after syscall.Rusage
		must(syscall.Getrusage(syscall.RUSAGE_SELF, &before))
		start := time.Now()
		final = run()
		wall := float64(time.Since(start).Microseconds()) / 1000
		must(syscall.Getrusage(syscall.RUSAGE_SELF, &after))
		samples = append(samples, map[string]any{"wallMs": wall, "cpuUserMs": (micros(after.Utime) - micros(before.Utime)) / 1000, "cpuSystemMs": (micros(after.Stime) - micros(before.Stime)) / 1000, "processPeakRSSKiB": after.Maxrss})
	}
	b, e := json.Marshal(map[string]any{"runtime": runtime.Version(), "platform": runtime.GOOS, "arch": runtime.GOARCH, "warmups": 1, "samples": samples, "work": final})
	must(e)
	fmt.Println(string(b))
}
