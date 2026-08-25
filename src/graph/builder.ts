import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { readFileSync } from "node:fs";
import { CodeSymbol, SymbolGraph, SymbolKind, addSymbol } from "./types.js";

const language = TypeScript.typescript;

const declarationQuery = new Parser.Query(
  language,
  `
  (function_declaration
    name: (identifier) @function.name) @function.declaration

  (method_definition
    name: (property_identifier) @method.name) @method.declaration

  (class_declaration
    name: (type_identifier) @class.name) @class.declaration
  `
);

function kindFromCaptureName(captureName: string): SymbolKind | null {
  if (captureName === "function.name") return "function";
  if (captureName === "method.name") return "method";
  if (captureName === "class.name") return "class";
  return null;
}

export function extractSymbolsFromFile(filePath: string): CodeSymbol[] {
  const parser = new Parser();
  parser.setLanguage(language);

  const source = readFileSync(filePath, "utf8");
  const tree = parser.parse(source);
  const matches = declarationQuery.matches(tree.rootNode);
  const symbols: CodeSymbol[] = [];

  for (const match of matches) {
    let nameNode: Parser.SyntaxNode | null = null;
    let declNode: Parser.SyntaxNode | null = null;
    let kind: SymbolKind | null = null;

    for (const capture of match.captures) {
      if (capture.name.endsWith(".name")) {
        nameNode = capture.node;
        kind = kindFromCaptureName(capture.name);
      } else if (capture.name.endsWith(".declaration")) {
        declNode = capture.node;
      }
    }

    if (!nameNode || !declNode || !kind) continue;

    symbols.push({
      name: nameNode.text,
      kind,
      filePath,
      startLine: declNode.startPosition.row + 1,
      endLine: declNode.endPosition.row + 1,
    });
  }

  return symbols;
}

export function parseFileIntoGraph(filePath: string, graph: SymbolGraph): void {
  for (const symbol of extractSymbolsFromFile(filePath)) {
    addSymbol(graph, symbol);
  }
}