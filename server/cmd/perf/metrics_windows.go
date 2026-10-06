package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

var kernel32 = syscall.NewLazyDLL("kernel32.dll")
var getProcessTimes = kernel32.NewProc("GetProcessTimes")
var getProcessMemoryInfo = syscall.NewLazyDLL("psapi.dll").NewProc("GetProcessMemoryInfo")

type processMemoryCounters struct {
	Size, PageFaults                                                                             uint32
	PeakWorkingSet, WorkingSet, PeakPaged, Paged, PeakNonPaged, NonPaged, Pagefile, PeakPagefile uintptr
}
type metrics struct {
	UserMs, KernelMs  float64
	PeakWorkingSetKiB uint64
}

func fileTimeMS(value syscall.Filetime) float64 {
	return float64(uint64(value.HighDateTime)<<32|uint64(value.LowDateTime)) / 10000
}
func processMetrics() (metrics, error) {
	var created, exited, kernel, user syscall.Filetime
	handle := ^uintptr(0)
	ok, _, err := getProcessTimes.Call(handle, uintptr(unsafe.Pointer(&created)), uintptr(unsafe.Pointer(&exited)), uintptr(unsafe.Pointer(&kernel)), uintptr(unsafe.Pointer(&user)))
	if ok == 0 {
		return metrics{}, fmt.Errorf("GetProcessTimes: %w", err)
	}
	var memory processMemoryCounters
	memory.Size = uint32(unsafe.Sizeof(memory))
	ok, _, err = getProcessMemoryInfo.Call(handle, uintptr(unsafe.Pointer(&memory)), uintptr(memory.Size))
	if ok == 0 {
		return metrics{}, fmt.Errorf("GetProcessMemoryInfo: %w", err)
	}
	return metrics{fileTimeMS(user), fileTimeMS(kernel), uint64(memory.PeakWorkingSet) / 1024}, nil
}
