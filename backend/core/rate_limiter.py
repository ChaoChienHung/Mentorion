import time

class RateLimiter:
    def __init__(self, limit: int, window_sec: int):
        self.limit = limit
        self.window = window_sec
        self.store = {}

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window

        timestamps = self.store.get(key, [])
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= self.limit:
            self.store[key] = timestamps
            return False

        timestamps.append(now)
        self.store[key] = timestamps
        return True