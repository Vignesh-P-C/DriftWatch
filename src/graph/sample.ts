function add(a: number, b: number, c: number): number {
  return a + b + c;
}
class Calculator {
  total: number = 0;
  addToTotal(n: number) {
    this.total += n;
  }
}
