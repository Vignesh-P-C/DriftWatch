function add(a: number, b: number, c: number): number {
  return a + b + c;
}
class Calculator {
  total: number = 0;
  addToTotal(n: number) {
    this.total += n;
  }
}
function useAdd() {
<<<<<<< HEAD
  return add(2, 3);
}
=======
  return add(2, 3, 8);
}
>>>>>>> test-branch-a
