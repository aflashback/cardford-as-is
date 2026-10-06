//go:build windows

// perf is a private native-Windows replay worker. It opens no listener or DB.
package main

import (
	"cardford/server/internal/compatibility"
	"cardford/server/internal/contracts"
	"cardford/server/internal/gamekernel"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"runtime"
	"runtime/pprof"
	"time"
)

const protocol = "windows-replay-1"

type expectedFrame struct {
	CommandIndex                             int    `json:"commandIndex"`
	StateSHA256                              string `json:"stateSha256"`
	Observations, Legal, Views, CandidateIDs []string
}
type savedCase struct {
	Mode, ConfigJSON, InitialStateJSON string
	Deal                               []string
	CommandJSONs                       []string
	Expected                           []expectedFrame
}
type workload struct {
	Protocol string
	Cases    []savedCase
}
type counters struct {
	Jobs                      int `json:"jobs"`
	InitialStateDecodes       int `json:"initialStateDecodes"`
	CommandDecodes            int `json:"commandDecodes"`
	CheckpointValidations     int `json:"checkpointValidations"`
	Transitions               int `json:"transitions"`
	Checkpoints               int `json:"checkpoints"`
	Observations              int `json:"observations"`
	PublicViews               int `json:"publicViews"`
	CandidateSets             int `json:"candidateSets"`
	Candidates                int `json:"candidates"`
	PublicOutputValidations   int `json:"publicOutputValidations"`
	StateSerializations       int `json:"stateSerializations"`
	ObservationSerializations int `json:"observationSerializations"`
	ViewSerializations        int `json:"viewSerializations"`
	FrameSerializations       int `json:"frameSerializations"`
	StateBytes                int `json:"stateBytes"`
	ObservationBytes          int `json:"observationBytes"`
	ViewBytes                 int `json:"viewBytes"`
	FrameBytes                int `json:"frameBytes"`
}
type workResult struct {
	Counts              counters `json:"counts"`
	FrameRawSHA256      string   `json:"frameRawSHA256"`
	FinalStateRawHashes []string `json:"finalStateRawHashes"`
}
type sample struct {
	WallMs            float64    `json:"wallMs"`
	CPUUserMs         float64    `json:"cpuUserMs"`
	CPUKernelMs       float64    `json:"cpuKernelMs"`
	PeakWorkingSetKiB uint64     `json:"processLifetimePeakWorkingSetKiB"`
	Work              workResult `json:"work"`
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
func milliseconds(d time.Duration) float64 { return float64(d) / float64(time.Millisecond) }
func rawSHA(raw []byte) string             { hash := sha256.Sum256(raw); return hex.EncodeToString(hash[:]) }
func semanticSHA(raw []byte) (string, error) {
	canonical, err := contracts.UTF16Canonical(raw)
	if err != nil {
		return "", err
	}
	return rawSHA(canonical), nil
}
func verify(frame gamekernel.Frame, want expectedFrame) error {
	if frame.CommandIndex != want.CommandIndex {
		return fmt.Errorf("command index mismatch")
	}
	hash, err := semanticSHA(frame.State)
	if err != nil {
		return err
	}
	if hash != want.StateSHA256 {
		return fmt.Errorf("original state hash mismatch at %d", frame.CommandIndex)
	}
	for seat := 0; seat < 4; seat++ {
		ids, err := json.Marshal(frame.CandidateIDs[seat])
		if err != nil {
			return err
		}
		var observation struct{ LegalActions json.RawMessage }
		if err = json.Unmarshal(frame.Observations[seat], &observation); err != nil {
			return err
		}
		for _, check := range []struct {
			raw         []byte
			want, label string
		}{{frame.Observations[seat], want.Observations[seat], "observation"}, {observation.LegalActions, want.Legal[seat], "legal"}, {frame.Views[seat], want.Views[seat], "view"}, {ids, want.CandidateIDs[seat], "candidate IDs"}} {
			got, err := semanticSHA(check.raw)
			if err != nil {
				return err
			}
			if got != check.want {
				return fmt.Errorf("original %s hash mismatch at %d seat %d", check.label, frame.CommandIndex, seat)
			}
		}
	}
	return nil
}
func job(input workload, variant string, verifyOnly bool) (workResult, error) {
	result := workResult{Counts: counters{Jobs: 1}, FinalStateRawHashes: []string{}}
	c := &result.Counts
	stream := sha256.New()
	registry := compatibility.Registry()
	executor, err := gamekernel.NewExecutor(registry, gamekernel.DefaultLimits())
	if err != nil {
		return result, err
	}
	for _, saved := range input.Cases {
		commands := make([]json.RawMessage, len(saved.CommandJSONs))
		for i, value := range saved.CommandJSONs {
			commands[i] = json.RawMessage(value)
		}
		consume := func(frame gamekernel.Frame, encoded []byte) error {
			c.Checkpoints++
			c.StateSerializations++
			c.StateBytes += len(frame.State)
			c.FrameBytes += len(encoded)
			c.FrameSerializations++
			if len(frame.State) > gamekernel.MaxStateBytes || len(encoded) > gamekernel.MaxFrameBytes {
				return gamekernel.ErrBudget
			}
			for seat, view := range frame.Views {
				if err := contracts.Validate("GameView", view); err != nil {
					return err
				}
				c.PublicOutputValidations++
				c.Observations++
				c.PublicViews++
				c.CandidateSets++
				c.Candidates += len(frame.CandidateIDs[seat])
				c.ObservationSerializations++
				c.ViewSerializations++
				c.ObservationBytes += len(frame.Observations[seat])
				c.ViewBytes += len(view)
			}
			if _, err := stream.Write(encoded); err != nil {
				return err
			}
			if verifyOnly {
				if err := verify(frame, saved.Expected[frame.CommandIndex+1]); err != nil {
					return err
				}
			}
			return nil
		}
		request := gamekernel.ReplayRequest{Mode: saved.Mode, Commands: commands, Seats: []int{0, 1, 2, 3}}
		if variant == "native-go" {
			native, err := executor.ReplayNative(context.Background(), gamekernel.NativeReplayRequest{ReplayRequest: request, InitialState: json.RawMessage(saved.InitialStateJSON)}, func(frame gamekernel.EncodedFrame) error { return consume(frame.Frame, frame.Bytes) })
			if err != nil {
				return result, err
			}
			c.InitialStateDecodes++
			c.CommandDecodes += len(commands)
			c.CheckpointValidations += len(commands) + 1
			c.Transitions += native.Transitions
			result.FinalStateRawHashes = append(result.FinalStateRawHashes, rawSHA(native.Final.State))
		} else {
			request.Config = json.RawMessage(saved.ConfigJSON)
			request.Deal = saved.Deal
			legacy, err := executor.Replay(context.Background(), request, func(frame gamekernel.Frame) error {
				encoded, err := json.Marshal(frame)
				if err != nil {
					return err
				}
				return consume(frame, encoded)
			})
			if err != nil {
				return result, err
			}
			c.CommandDecodes += len(commands)
			c.Transitions += legacy.Transitions
			c.CheckpointValidations += 13*(len(commands)+1) + 2*len(commands)
			if saved.Mode != "hearts" {
				c.CheckpointValidations++
			} // Spades EncodeState also checks Create.
			c.FrameSerializations += len(commands) + 1
			result.FinalStateRawHashes = append(result.FinalStateRawHashes, rawSHA(legacy.Final.State))
		}
	}
	result.FrameRawSHA256 = hex.EncodeToString(stream.Sum(nil))
	return result, nil
}
func main() {
	workerStart := time.Now()
	workloadPath := flag.String("workload", "", "common private input path")
	variant := flag.String("variant", "native-go", "native-go or legacy-go")
	warmups := flag.Int("warmups", 3, "untimed warmup jobs")
	sampleCount := flag.Int("samples", 1, "timed jobs")
	verifyOnly := flag.Bool("verify", false, "untimed original checkpoint verification")
	cpuProfile := flag.String("cpu-profile", "", "separate CPU profiling run")
	allocProfile := flag.String("alloc-profile", "", "separate allocations profile")
	flag.Parse()
	if runtime.GOOS != "windows" || runtime.GOARCH != "amd64" {
		panic("native Windows x64 required")
	}
	if *variant != "native-go" && *variant != "legacy-go" {
		panic("invalid variant")
	}
	if *warmups < 0 || *sampleCount < 1 {
		panic("invalid repetitions")
	}
	inputStart := time.Now()
	bytes, err := os.ReadFile(*workloadPath)
	must(err)
	var input workload
	must(json.Unmarshal(bytes, &input))
	if input.Protocol != protocol {
		panic("protocol mismatch")
	}
	inputPreparationMs := milliseconds(time.Since(inputStart))
	profiling := *cpuProfile != "" || *allocProfile != ""
	if *allocProfile != "" {
		runtime.MemProfileRate = 1
	}
	measured := func() sample {
		before, err := processMetrics()
		must(err)
		start := time.Now()
		work, err := job(input, *variant, *verifyOnly)
		must(err)
		wall := milliseconds(time.Since(start))
		after, err := processMetrics()
		must(err)
		return sample{wall, after.UserMs - before.UserMs, after.KernelMs - before.KernelMs, after.PeakWorkingSetKiB, work}
	}
	preparationMs := milliseconds(time.Since(workerStart))
	var cold *sample
	for i := 0; i < *warmups; i++ {
		value := measured()
		if i == 0 {
			cold = &value
		}
	}
	// CPU attribution excludes schema initialization and the common warmups.
	// Allocation diagnostics use a separate process with zero warmups.
	if *cpuProfile != "" {
		file, err := os.Create(*cpuProfile)
		must(err)
		must(pprof.StartCPUProfile(file))
		defer func() { pprof.StopCPUProfile(); must(file.Close()) }()
	}
	samples := make([]sample, 0, *sampleCount)
	for i := 0; i < *sampleCount; i++ {
		samples = append(samples, measured())
	}
	if *allocProfile != "" {
		runtime.GC()
		file, err := os.Create(*allocProfile)
		must(err)
		must(pprof.Lookup("allocs").WriteTo(file, 0))
		must(file.Close())
	}
	cwd, err := os.Getwd()
	must(err)
	out, err := json.Marshal(map[string]any{"protocol": protocol, "variant": *variant, "runtime": runtime.Version(), "platform": runtime.GOOS, "arch": runtime.GOARCH, "cwd": cwd, "workloadSHA256": rawSHA(bytes), "warmups": *warmups, "verificationOnly": *verifyOnly, "profilingOnly": profiling, "inputPreparationMs": inputPreparationMs, "preparationMs": preparationMs, "coldJob": cold, "samples": samples, "workerWallMs": milliseconds(time.Since(workerStart)), "operationCounterScope": "Declared semantic boundaries. Legacy-go additionally repeats private decode/projection; its checkpoint validation count is source-derived, not an instrumented low-level cost."})
	must(err)
	fmt.Println(string(out))
}
