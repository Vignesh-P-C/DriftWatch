export type SymbolKind = "function" | "class" | "method";

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
}

export type SymbolGraph = Map<string, CodeSymbol[]>;

export function addSymbol(graph: SymbolGraph, symbol: CodeSymbol): void {
  const existing = graph.get(symbol.name);
  if (existing) {
    existing.push(symbol);
  } else {
    graph.set(symbol.name, [symbol]);
  }
}