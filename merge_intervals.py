from functools import reduce
from typing import List


class Solution:
    def merge(self, intervals: List[List[int]]) -> List[List[int]]:

        START: int = 0
        END:   int = 1

        def overlaps(last_interval: List[int], current_interval: List[int]) -> bool:
            last_end:      int = last_interval[END]
            current_start: int = current_interval[START]
            return last_end >= current_start

        def extend(last_interval: List[int], current_interval: List[int]) -> List[int]:
            last_start:  int = last_interval[START]
            current_end: int = current_interval[END]
            return [last_start, max(last_interval[END], current_end)]

        def reducer(merged: List[List[int]], current_interval: List[int]) -> List[List[int]]:
            *merged_without_last, last_interval = merged
            if overlaps(last_interval, current_interval):
                return merged_without_last + [extend(last_interval, current_interval)]
            return merged + [current_interval]

        sorted_intervals = sorted(intervals, key=lambda interval: interval[START])
        first_interval, *remaining_intervals = sorted_intervals

        return reduce(reducer, remaining_intervals, [first_interval])
