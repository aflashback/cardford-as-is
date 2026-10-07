package records

import (
	"fmt"
	"reflect"
	"time"
)

type ExecutionLimits struct {
	Deadline time.Duration
	Lease    time.Duration
}

const MaxRegisteredWorkLease = 95 * time.Second

func validateExecutionLimits(l ExecutionLimits) error {
	if l.Deadline < time.Millisecond || l.Deadline > 90*time.Second || l.Lease <= l.Deadline || l.Lease > MaxRegisteredWorkLease {
		return fmt.Errorf("invalid bounded execution limits")
	}
	return nil
}
func effectiveExecutionLimits(l ExecutionLimits) ExecutionLimits {
	if l == (ExecutionLimits{}) {
		return ExecutionLimits{Deadline: 20 * time.Second, Lease: 25 * time.Second}
	}
	return l
}

// ConfigureExecutionLimits is trusted startup composition for one immutable
// registered tuple. Changing these operational bounds never changes work caps.
func (c *DocumentCodec) ConfigureExecutionLimits(module ModulePin, policy PolicyPin, limits ExecutionLimits) error {
	if err := validateExecutionLimits(limits); err != nil {
		return err
	}
	if c == nil {
		return fmt.Errorf("missing codec")
	}
	for i, p := range c.policies {
		if p.Module == module && reflect.DeepEqual(p.Policy, policy) {
			if p.ExecutionLimits != (ExecutionLimits{}) && p.ExecutionLimits != limits {
				return fmt.Errorf("cannot replace installed execution limits")
			}
			c.policies[i].ExecutionLimits = limits
			return nil
		}
	}
	return fmt.Errorf("execution limits require exact installed policy")
}
func (c *DocumentCodec) WorkLimits(module ModulePin, policy PolicyPin) (ExecutionLimits, error) {
	if c != nil {
		for _, p := range c.policies {
			if p.Module == module && reflect.DeepEqual(p.Policy, policy) {
				return effectiveExecutionLimits(p.ExecutionLimits), nil
			}
		}
	}
	return ExecutionLimits{}, fmt.Errorf("uninstalled exact policy limits")
}

// WorkLimitsForPolicy is for admission before loading a game. Extended leases
// are still checked against the loaded game module and tuple by ClaimWork.
func (c *DocumentCodec) WorkLimitsForPolicy(policy PolicyPin) (ExecutionLimits, error) {
	var out ExecutionLimits
	found := false
	if c != nil {
		for _, p := range c.policies {
			if reflect.DeepEqual(p.Policy, policy) {
				current := effectiveExecutionLimits(p.ExecutionLimits)
				if found && out != current {
					return ExecutionLimits{}, fmt.Errorf("policy operational limits differ across modules")
				}
				out = current
				found = true
			}
		}
	}
	if !found {
		return out, fmt.Errorf("uninstalled exact policy limits")
	}
	return out, nil
}
func (c *DocumentCodec) validateWorkLease(module ModulePin, policy PolicyPin, duration time.Duration) error {
	if duration < time.Millisecond || duration > MaxRegisteredWorkLease {
		return ErrWorkStale
	}
	limits, err := c.WorkLimits(module, policy)
	if err != nil {
		return ErrWorkStale
	}
	maximum := MaxWorkLease
	if limits.Lease > maximum {
		maximum = limits.Lease
	}
	if duration > maximum {
		return ErrWorkStale
	}
	return nil
}
