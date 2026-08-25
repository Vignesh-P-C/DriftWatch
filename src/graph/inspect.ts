import { parseFileIntoGraph } from "./builder.js";
import { SymbolGraph } from "./types.js";

const graph: SymbolGraph = new Map();
parseFileIntoGraph("src/graph/sample.ts", graph);

for (const [name, symbols] of graph) {
  console.log(name, symbols);
}