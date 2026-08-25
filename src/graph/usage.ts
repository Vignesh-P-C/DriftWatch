import Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";
import { readFileSync } from "node:fs";
import { walkDirectory } from "./walker.js";

const language = TypeScript.typescript;

export interface UsageLocation {
  name: string;
  filePath: string;
  line: number;
}

function escapeForRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUsageQuery(names: string[]): Parser.Query {
  const pattern = `^(${names.map(escapeForRegex).join("|")})$`;

  return new Parser.Query(
    language,
    `
    (call_expression
      function: (identifier) @call.name
      (#match? @call.name "${pattern}"))

    (call_expression
      function: (member_expression
        property: (property_identifier) @call.name)
      (#match? @call.name "${pattern}"))
    `
  );
}

export function findUsagesInFile(filePath: string, names: string[]): UsageLocation[] {
  if (names.length === 0) return [];

  const parser = new Parser();
  parser.setLanguage(language);
  const source = readFileSync(filePath, "utf8");
  const tree = parser.parse(source);

  const query = buildUsageQuery(names);
  const usages: UsageLocation[] = [];

  for (const match of query.matches(tree.rootNode)) {
    for (const capture of match.captures) {
      if (capture.name === "call.name") {
        usages.push({
          name: capture.node.text,
          filePath,
          line: capture.node.startPosition.row + 1,
        });
      }
    }
  }

  return usages;
}

export function findUsagesInWorktree(worktreePath: string, names: string[]): UsageLocation[] {
  if (names.length === 0) return [];

  const usages: UsageLocation[] = [];
  walkDirectory(worktreePath, (filePath) => {
    usages.push(...findUsagesInFile(filePath, names));
  });
  return usages;
}