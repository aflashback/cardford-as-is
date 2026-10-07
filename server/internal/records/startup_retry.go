package records

import (
	"context"
	"errors"
	"net"
	"os"
	"runtime"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The native Windows net package disables SYN retransmissions on loopback.
// A Winsock 10060 can therefore end a dial before the startup deadline. Permit
// one replacement socket for that exact pre-connection failure, only while
// opening the explicitly selected local service. No SQL is retried.
func configureLocalStartupRetry(cfg *pgxpool.Config, startup context.Context, localService bool) func() {
	if runtime.GOOS != "windows" || !localService {
		return func() {}
	}
	var active atomic.Bool
	active.Store(true)
	dial := cfg.ConnConfig.DialFunc
	cfg.ConnConfig.DialFunc = func(ctx context.Context, network, address string) (net.Conn, error) {
		if !active.Load() {
			return dial(ctx, network, address)
		}
		// puddle keeps connection construction alive independently of acquisition.
		// Cap both socket attempts by the original startup deadline nonetheless.
		if deadline, ok := startup.Deadline(); ok {
			var cancel context.CancelFunc
			ctx, cancel = context.WithDeadline(ctx, deadline)
			defer cancel()
		}
		ctx, cancel := context.WithCancel(ctx)
		stop := context.AfterFunc(startup, cancel)
		defer func() { stop(); cancel() }()
		if startup.Err() != nil {
			return nil, startup.Err()
		}
		return dialStartupLoopback(ctx, network, address, dial)
	}
	return func() { active.Store(false) }
}

func dialStartupLoopback(ctx context.Context, network, address string, dial pgconn.DialFunc) (net.Conn, error) {
	conn, err := dial(ctx, network, address)
	if conn != nil || err == nil || ctx.Err() != nil || !retryableStartupDial(network, address, err) {
		return conn, err
	}
	timer := time.NewTimer(50 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-timer.C:
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		return dial(ctx, network, address)
	}
}

func retryableStartupDial(network, address string, err error) bool {
	if runtime.GOOS != "windows" || (network != "tcp" && network != "tcp4" && network != "tcp6") {
		return false
	}
	host, _, splitErr := net.SplitHostPort(address)
	if splitErr != nil || !net.ParseIP(host).IsLoopback() {
		return false
	}
	var operation *net.OpError
	var system *os.SyscallError
	var code syscall.Errno
	return errors.As(err, &operation) && operation.Op == "dial" &&
		errors.As(operation.Err, &system) && system.Syscall == "connectex" &&
		errors.As(system.Err, &code) && code == 10060
}
