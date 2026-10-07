package records

import (
	"cardford/server/internal/sessions"
	"reflect"
)

// IsPolicyInstalled exposes exact immutable registration identity, never a
// mutable registration or an executor replacement capability.
func (c *DocumentCodec) IsPolicyInstalled(selector sessions.Selector, policy PolicyPin) bool {
	if c == nil || c.serviceRegistry == nil {
		return false
	}
	installed, err := c.serviceRegistry.Installation(selector)
	if err != nil {
		return false
	}
	for _, p := range c.policies {
		if p.Module == ModulePin(installed.Pin) && reflect.DeepEqual(p.Policy, policy) {
			return true
		}
	}
	return false
}
