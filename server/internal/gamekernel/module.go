// Package gamekernel supplies a small, injected compatibility seam. Rules,
// phases, commands, scores and public projections belong to registered games.
package gamekernel

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
)

// Module has no game-specific phase or competition assumptions. V1 chance
// material currently uses recorded string tokens; modules own their meaning.
type Module interface {
	Create(json.RawMessage, []string) (json.RawMessage, error)
	Apply(json.RawMessage, json.RawMessage) (json.RawMessage, error)
	Observe(json.RawMessage, int) (json.RawMessage, error)
	Legal(json.RawMessage, int) (json.RawMessage, error)
	SafeView(json.RawMessage, int) (json.RawMessage, error)
	CandidateIDs(json.RawMessage, int) ([]string, error)
	Validate(json.RawMessage) error
}

// Funcs adapts game-owned package functions without importing games here.
type Funcs struct {
	CreateFunc       func(json.RawMessage, []string) (json.RawMessage, error)
	ApplyFunc        func(json.RawMessage, json.RawMessage) (json.RawMessage, error)
	ObserveFunc      func(json.RawMessage, int) (json.RawMessage, error)
	LegalFunc        func(json.RawMessage, int) (json.RawMessage, error)
	SafeViewFunc     func(json.RawMessage, int) (json.RawMessage, error)
	CandidateIDsFunc func(json.RawMessage, int) ([]string, error)
	ValidateFunc     func(json.RawMessage) error
}

func (f Funcs) Create(c json.RawMessage, d []string) (json.RawMessage, error) {
	return f.CreateFunc(c, d)
}
func (f Funcs) Apply(s, c json.RawMessage) (json.RawMessage, error)       { return f.ApplyFunc(s, c) }
func (f Funcs) Observe(s json.RawMessage, a int) (json.RawMessage, error) { return f.ObserveFunc(s, a) }
func (f Funcs) Legal(s json.RawMessage, a int) (json.RawMessage, error)   { return f.LegalFunc(s, a) }
func (f Funcs) SafeView(s json.RawMessage, a int) (json.RawMessage, error) {
	return f.SafeViewFunc(s, a)
}
func (f Funcs) CandidateIDs(s json.RawMessage, a int) ([]string, error) {
	return f.CandidateIDsFunc(s, a)
}
func (f Funcs) Validate(s json.RawMessage) error { return f.ValidateFunc(s) }
func (f Funcs) valid() bool {
	return f.CreateFunc != nil && f.ApplyFunc != nil && f.ObserveFunc != nil && f.LegalFunc != nil && f.SafeViewFunc != nil && f.CandidateIDsFunc != nil && f.ValidateFunc != nil
}

type Registry struct {
	mu      sync.RWMutex
	modules map[string]Module
}

func NewRegistry() *Registry { return &Registry{modules: map[string]Module{}} }
func (r *Registry) Register(mode string, module Module) error {
	if r == nil || mode == "" || module == nil {
		return fmt.Errorf("invalid module registration")
	}
	value := reflect.ValueOf(module)
	if value.Kind() == reflect.Pointer && value.IsNil() {
		return fmt.Errorf("nil module registration")
	}
	if f, ok := module.(Funcs); ok && !f.valid() {
		return fmt.Errorf("incomplete module functions")
	}
	if f, ok := module.(*Funcs); ok && !f.valid() {
		return fmt.Errorf("incomplete module functions")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.modules == nil {
		r.modules = map[string]Module{}
	}
	if _, exists := r.modules[mode]; exists {
		return fmt.Errorf("module already registered: %s", mode)
	}
	r.modules[mode] = module
	return nil
}
func (r *Registry) Resolve(mode string) (Module, error) {
	if r == nil {
		return nil, fmt.Errorf("missing registry")
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	m, ok := r.modules[mode]
	if !ok {
		return nil, fmt.Errorf("unsupported module: %s", mode)
	}
	return m, nil
}
