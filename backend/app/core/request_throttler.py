import time


class RequestThrottler:
    def __init__(self, requests_per_minute: int = 60):
        if not isinstance(requests_per_minute, int):
            raise TypeError(
                f"Requests per minute must be an integer, got {type(requests_per_minute)}"
            )

        self.requests_per_minute: int = requests_per_minute
        self.last_request_time: float = 0.0

    def wait_if_needed(self):
        current_time = time.time()
        min_interval: float = 60.0 / self.requests_per_minute

        if current_time - self.last_request_time < min_interval:
            wait_time = min_interval - (current_time - self.last_request_time)
            time.sleep(wait_time)

        self.last_request_time = time.time()
