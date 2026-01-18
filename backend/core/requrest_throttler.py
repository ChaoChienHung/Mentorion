import time

# -----------------
# Request Throttler
# -----------------
class RequestThrottler:
    """
    Basic request throttler to control API request frequency and prevent server overload.

    This class tracks the time of the last API request and enforces a minimum interval
    between requests based on the configured `requests_per_minute`. If a request is made
    too soon, the class will pause execution to ensure the rate limit is respected.

    Parameters:
    - requests_per_minute (int): Maximum number of requests allowed per minute.
    """

    def __init__(self, requests_per_minute: int = 60):
        if not isinstance(requests_per_minute, int):
            raise TypeError(f"Requests per minute must be an integer, got {type(title)}")

        self.requests_per_minute: int = requests_per_minute
        self.last_request_time: int = 0

    def wait_if_needed(self):
        """
        Waits if the rate limit has been reached.

        If the last request was made too recently, this method will pause execution
        using `time.sleep()` to comply with the rate limit.

        Updates `self.last_request_time` to the current time after waiting.
        """
        current_time = time.time()
        min_interval: float = 60.0 / self.requests_per_minute

        if current_time - self.last_request_time < min_interval:
            wait_time = min_interval - (current_time - self.last_request_time)
            time.sleep(wait_time)

        self.last_request_time = time.time()