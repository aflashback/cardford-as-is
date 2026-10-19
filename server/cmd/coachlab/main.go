// coachlab collects deterministic native full games without a browser or DB.
package main

import (
	"cardford/server/internal/evaluation/coachlab"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
)

func execute(args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("coachlab", flag.ContinueOnError)
	flags.SetOutput(stderr)
	manifest := flags.String("manifest", "", "frozen private run envelope")
	out := flags.String("out", "", "new output directory, or verified existing directory with --resume")
	root := flags.String("source-root", ".", "checkout containing the frozen source graph")
	resume := flags.Bool("resume", false, "verify journal and continue original preparations")
	identity := flags.Bool("identity", false, "print current mandatory source graph and exact binary digest")
	evaluation := flags.String("evaluate-config", "", "evaluate an existing archive using an explicit bounded offline configuration")
	maxDecisions := flags.Int("max-decisions", 8, "maximum new offline evaluation attempts in this invocation (1..128)")
	if err := flags.Parse(args); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "unexpected positional arguments")
		return 2
	}
	binary, err := os.Executable()
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	if *identity {
		hashes, pin, err := coachlab.SourceSnapshot(*root, binary)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		return encode(stdout, stderr, map[string]any{"sourceHashes": hashes, "sourceIdentity": pin})
	}
	if *manifest == "" || *out == "" {
		fmt.Fprintln(stderr, "Use --manifest <private.json> --out <directory> [--source-root <checkout>] [--resume]")
		return 2
	}
	raw, err := os.ReadFile(*manifest)
	if err != nil {
		fmt.Fprintln(stderr, "manifest:", err)
		return 1
	}
	envelope, err := coachlab.DecodeRun(raw)
	if err != nil {
		fmt.Fprintln(stderr, "manifest:", err)
		return 1
	}
	if err = coachlab.VerifySources(*root, binary, envelope); err != nil {
		fmt.Fprintln(stderr, "source admission:", err)
		return 1
	}
	var evaluationConfig coachlab.EvaluationBatchConfig
	if *evaluation != "" {
		data, readErr := os.ReadFile(*evaluation)
		if readErr != nil {
			fmt.Fprintln(stderr, "evaluation configuration:", readErr)
			return 1
		}
		evaluationConfig, err = coachlab.DecodeEvaluationBatch(data)
		if err != nil {
			fmt.Fprintln(stderr, "evaluation configuration:", err)
			return 1
		}
		if *maxDecisions < 1 || *maxDecisions > 128 {
			fmt.Fprintln(stderr, "max-decisions must be 1..128")
			return 2
		}
	} else {
		explicitLimit := false
		flags.Visit(func(f *flag.Flag) {
			if f.Name == "max-decisions" {
				explicitLimit = true
			}
		})
		if explicitLimit {
			fmt.Fprintln(stderr, "max-decisions requires evaluate-config")
			return 2
		}
	}
	journal, err := coachlab.OpenJournal(*out, envelope, *resume || *evaluation != "")
	if err != nil {
		fmt.Fprintln(stderr, "journal admission:", err)
		return 1
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	if *evaluation != "" {
		receipt, evaluationErr := coachlab.EvaluateArchive(ctx, envelope, journal, evaluationConfig, *maxDecisions)
		if err = journal.Close(); err != nil && evaluationErr == nil {
			evaluationErr = err
		}
		if code := encode(stdout, stderr, receipt); code != 0 {
			return code
		}
		if evaluationErr != nil {
			fmt.Fprintln(stderr, "archive evaluation:", evaluationErr)
			return 1
		}
		return 0
	}
	receipt, runErr := coachlab.Run(ctx, envelope, journal)
	if runErr != nil {
		receipt = coachlab.FailureReceipt(envelope, journal, runErr)
		_ = journal.Append("run-receipt", receipt)
	}
	if err = coachlab.ExportCorpus(journal, receipt); err != nil {
		fmt.Fprintln(stderr, "corpus export:", err)
		if runErr == nil {
			runErr = err
		}
	}
	if err = journal.Close(); err != nil {
		fmt.Fprintln(stderr, "close:", err)
		if runErr == nil {
			runErr = err
		}
	}
	if code := encode(stdout, stderr, receipt); code != 0 {
		return code
	}
	if runErr != nil {
		fmt.Fprintln(stderr, "run:", runErr)
		return 1
	}
	if receipt.Status == "failed" {
		return 1
	}
	return 0
}
func encode(stdout, stderr io.Writer, value any) int {
	if err := json.NewEncoder(stdout).Encode(value); err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
func main() { os.Exit(execute(os.Args[1:], os.Stdout, os.Stderr)) }
