import time
import threading
from collections import deque
from typing import Dict


class SlidingWindowRateLimiter:
    """
    Thread-safe sliding window rate limiter with O(1) amortized performance.

    This limiter enforces a maximum number of actions within a rolling
    time window per key (e.g., user ID, IP address).

    Implementation details:
    - Uses a deque to store timestamps of recent actions
    - Evicts expired timestamps incrementally on each request
    - Avoids full list scans, achieving O(1) amortized time per call
    - Uses a global lock to ensure thread safety

    Characteristics:
    - Strict enforcement of limits within the sliding window
    - No burst allowance beyond the configured limit
    - Memory usage grows with the number of unique keys

    Limitations:
    - In-memory only (single-process)
    - Not suitable for distributed systems without shared storage

    Time complexity:
        Amortized O(1) per request

    Example:
        >>> limiter = SlidingWindowRateLimiter(limit=5, window_sec=60)
        >>> limiter.is_allowed("user_123")
        True
    """

    def __init__(self, limit: int, window_sec: int):
        """
        Initialize the sliding window rate limiter.

        Parameters:
            limit (int):
                Maximum number of allowed actions within the time window.
            window_sec (int):
                Size of the rolling time window in seconds.
        """
        self.limit = limit
        self.window = window_sec
        self.store: Dict[str, deque] = {}
        self.lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        """
        Determine whether an action is allowed for the given key.

        This method:
        1. Removes expired timestamps outside the sliding window
        2. Checks if the remaining count exceeds the configured limit
        3. Records the current action if allowed

        Parameters:
            key (str):
                Identifier used for rate limiting
                (e.g., user ID, IP address, API key).

        Returns:
            bool:
                True  -> action is allowed and recorded
                False -> rate limit exceeded

        Notes:
            - Uses `time.monotonic()` to avoid issues with system clock changes
            - Timestamp eviction is incremental and amortized O(1)
        """
        now = time.monotonic()
        window_start = now - self.window

        with self.lock:
            q = self.store.setdefault(key, deque())

            # Evict expired timestamps (O(1) amortized)
            while q and q[0] <= window_start:
                q.popleft()

            if len(q) >= self.limit:
                return False

            q.append(now)
            return True


class TokenBucketRateLimiter:
    """
    Thread-safe token bucket rate limiter.

    The token bucket algorithm allows short bursts of traffic while
    enforcing a long-term average rate.

    Each key maintains a bucket of tokens:
    - Tokens are added at a fixed refill rate
    - Each request consumes one token
    - Requests are rejected when no tokens are available

    Characteristics:
    - Allows bursts up to `capacity`
    - Smooths traffic over time
    - Commonly used for API rate limiting

    Time complexity:
        O(1) per request

    Limitations:
    - In-memory only
    - Not shared across processes or machines
    """

    def __init__(self, capacity: int, refill_rate: float):
        """
        Initialize the token bucket rate limiter.

        Parameters:
            capacity (int):
                Maximum number of tokens in the bucket (burst size).
            refill_rate (float):
                Number of tokens added to the bucket per second.
        """
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens: Dict[str, float] = {}
        self.last_refill: Dict[str, float] = {}
        self.lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        """
        Determine whether an action is allowed for the given key.

        On each call:
        1. Refill tokens based on elapsed time
        2. Consume one token if available
        3. Reject the request if the bucket is empty

        Parameters:
            key (str):
                Identifier used for rate limiting
                (e.g., user ID, IP address, API key).

        Returns:
            bool:
                True  -> request allowed and token consumed
                False -> no tokens available
        """
        now = time.monotonic()

        with self.lock:
            tokens = self.tokens.get(key, self.capacity)
            last = self.last_refill.get(key, now)

            # Refill tokens
            elapsed = now - last
            tokens = min(self.capacity, tokens + elapsed * self.refill_rate)

            if tokens < 1:
                self.tokens[key] = tokens
                self.last_refill[key] = now
                return False

            # Consume token
            self.tokens[key] = tokens - 1
            self.last_refill[key] = now
            return True


class LeakyBucketRateLimiter:
    """
    Thread-safe leaky bucket rate limiter.

    The leaky bucket algorithm enforces a constant processing rate by
    leaking requests from the bucket at a fixed rate.

    Unlike token bucket:
    - Bursts are not allowed
    - Traffic is smoothed strictly over time

    Characteristics:
    - Predictable, stable output rate
    - Suitable for queues and background workers

    Time complexity:
        O(1) per request

    Limitations:
    - In-memory only
    - No burst tolerance
    """

    def __init__(self, capacity: int, leak_rate: float):
        """
        Initialize the leaky bucket rate limiter.

        Parameters:
            capacity (int):
                Maximum number of queued requests allowed.
            leak_rate (float):
                Number of requests leaked (processed) per second.
        """
        self.capacity = capacity
        self.leak_rate = leak_rate
        self.level: Dict[str, float] = {}
        self.last_check: Dict[str, float] = {}
        self.lock = threading.Lock()

    def is_allowed(self, key: str) -> bool:
        """
        Determine whether an action is allowed for the given key.

        On each call:
        1. Leak requests based on elapsed time
        2. Reject the request if the bucket is full
        3. Otherwise, enqueue the request

        Parameters:
            key (str):
                Identifier used for rate limiting
                (e.g., user ID, IP address, API key).

        Returns:
            bool:
                True  -> request accepted
                False -> bucket is full
        """
        now = time.monotonic()

        with self.lock:
            level = self.level.get(key, 0.0)
            last = self.last_check.get(key, now)

            # Leak queued requests
            elapsed = now - last
            level = max(0.0, level - elapsed * self.leak_rate)

            if level >= self.capacity:
                self.level[key] = level
                self.last_check[key] = now
                return False

            # Add request to bucket
            self.level[key] = level + 1
            self.last_check[key] = now
            return True