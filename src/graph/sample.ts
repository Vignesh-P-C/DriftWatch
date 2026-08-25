function add(a: number, b: number): number {
  return a + b;
}

class Calculator {
  total: number = 0;

  addToTotal(n: number) {
    this.total += n;
  }
}