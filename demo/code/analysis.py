"""Toy analysis an agent might write."""
from dataclasses import dataclass
from statistics import mean


@dataclass
class Sample:
    name: str
    values: list[float]

    @property
    def average(self) -> float:
        return mean(self.values) if self.values else float("nan")


def summarize(samples: list[Sample]) -> dict[str, float]:
    return {s.name: round(s.average, 2) for s in samples}


if __name__ == "__main__":
    print(summarize([Sample("a", [1, 2, 3]), Sample("b", [10, 20])]))
