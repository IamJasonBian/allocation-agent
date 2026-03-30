from functools import reduce
from typing import List


class NestedIterator:
    def __init__(self, nestedList: [NestedInteger]):

        def flatten(nested_list: [NestedInteger]) -> List[int]:
            def append_item(flat: List[int], item: NestedInteger) -> List[int]:
                if item.isInteger():
                    return flat + [item.getInteger()]
                return flat + flatten(item.getList())
            return reduce(append_item, nested_list, [])

        self.flat_integers: List[int] = flatten(nestedList)
        self.position:      int       = 0

    def next(self) -> int:
        current_integer, self.position = self.flat_integers[self.position], self.position + 1
        return current_integer

    def hasNext(self) -> bool:
        return self.position < len(self.flat_integers)
