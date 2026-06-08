use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

pub fn join_thread_with_timeout(handle: JoinHandle<()>, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if handle.is_finished() {
            let _ = handle.join();
            return true;
        }
        thread::sleep(Duration::from_millis(10));
    }
    false
}
