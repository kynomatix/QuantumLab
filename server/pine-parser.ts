import type { PineInput, PineParseResult } from "@shared/schema";

const DATE_KEYWORDS = ["date", "time", "start_date", "end_date", "from_date", "to_date", "startdate", "enddate", "fromdate", "todate", "start_time", "end_time"];

function isDateRelated(name: string, label: string): boolean {
  const combined = (name + " " + label).toLowerCase();
  return DATE_KEYWORDS.some(kw => combined.includes(kw)) || combined.includes("timestamp");
}

function parseArgString(argsStr: string): { positional: string[]; keyword: Record<string, string> } {
  const positional: string[] = [];
  const keyword: Record<string, string> = {};
  let depth = 0;
  let current = "";
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (inString) {
      current += ch;
      if (ch === stringChar && argsStr[i - 1] !== "\\") {
        inString = false;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") { depth++; current += ch; continue; }
    if (ch === ")" || ch === "]") { depth--; current += ch; continue; }
    if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        const eqIdx = findTopLevelEquals(trimmed);
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const val = trimmed.substring(eqIdx + 1).trim();
          keyword[key] = val;
        } else {
          positional.push(trimmed);
        }
      }
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) {
    const eqIdx = findTopLevelEquals(trimmed);
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      keyword[key] = val;
    } else {
      positional.push(trimmed);
    }
  }
  return { positional, keyword };
}

function findTopLevelEquals(s: string): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (ch === stringChar && s[i - 1] !== "\\") inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; continue; }
    if (ch === "(" || ch === "[") { depth++; continue; }
    if (ch === ")" || ch === "]") { depth--; continue; }
    if (ch === "=" && depth === 0 && s[i + 1] !== "=") return i;
  }
  return -1;
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseOptionsArray(s: string): string[] {
  const trimmed = s.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1);
  const items: string[] = [];
  let current = "";
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inString) {
      current += ch;
      if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inString = true; stringChar = ch; current += ch; continue; }
    if (ch === ",") {
      items.push(stripQuotes(current.trim()));
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(stripQuotes(current.trim()));
  return items;
}

function parseDefault(val: string, type: string): any {
  if (type === "bool") return val === "true";
  if (type === "int") return parseInt(val, 10) || 0;
  if (type === "float") return parseFloat(val) || 0;
  if (type === "string") return stripQuotes(val);
  return val;
}

export function parsePineScript(code: string): PineParseResult {
  const groups: Record<string, string> = {};
  const inputs: PineInput[] = [];
  const strategySettings: PineParseResult["strategySettings"] = {};

  const lines = code.split("\n");

  for (const line of lines) {
    const groupMatch = line.match(/(?:string\s+)?(\w+)\s*=\s*"([^"]*(?:═|─|━|=|—)[^"]*)"/);
    if (groupMatch) {
      groups[groupMatch[1]] = groupMatch[2];
    }
  }

  const strategyMatch = code.match(/strategy\s*\(([^)]+)\)/);
  if (strategyMatch) {
    const args = parseArgString(strategyMatch[1]);
    if (args.keyword["initial_capital"]) {
      strategySettings.initialCapital = parseFloat(args.keyword["initial_capital"]);
    }
    if (args.keyword["default_qty_value"]) {
      strategySettings.defaultQtyValue = parseFloat(args.keyword["default_qty_value"]);
    }
    if (args.keyword["commission_value"]) {
      strategySettings.commission = parseFloat(args.keyword["commission_value"]);
    }
  }

  const inputPattern = /(?:(?:int|float|bool|string|var)\s+)?(\w+)\s*=\s*input\.(int|float|bool|string|time|source)\s*\(([^)]*(?:\([^)]*\))*[^)]*)\)/g;
  let match;
  while ((match = inputPattern.exec(code)) !== null) {
    const varName = match[1];
    const type = match[2] as PineInput["type"];
    const argsStr = match[3];
    const { positional, keyword } = parseArgString(argsStr);

    const input: PineInput = {
      name: varName,
      type: type === "source" ? "string" : type,
      default: null,
      label: varName,
      optimizable: true,
    };

    if (positional[0]) {
      input.default = parseDefault(positional[0], type);
    }
    if (positional[1]) {
      input.label = stripQuotes(positional[1]);
    }

    if (keyword["defval"]) input.default = parseDefault(keyword["defval"], type);
    if (keyword["title"]) input.label = stripQuotes(keyword["title"]);
    if (keyword["minval"]) input.min = parseFloat(keyword["minval"]);
    if (keyword["maxval"]) input.max = parseFloat(keyword["maxval"]);
    if (keyword["step"]) input.step = parseFloat(keyword["step"]);
    if (keyword["options"]) input.options = parseOptionsArray(keyword["options"]);

    if (keyword["group"]) {
      const groupVar = keyword["group"].trim();
      input.group = groupVar;
      if (groups[groupVar]) {
        input.groupLabel = groups[groupVar];
      } else {
        input.groupLabel = stripQuotes(groupVar);
      }
    }

    if (type === "time" || type === "source") {
      input.optimizable = false;
    }
    if (isDateRelated(varName, input.label)) {
      input.optimizable = false;
    }

    if (type === "int" || type === "float") {
      if (input.min === undefined && input.default !== null) {
        input.min = type === "int" ? Math.max(1, Math.floor(input.default * 0.2)) : Math.max(0.01, input.default * 0.2);
      }
      if (input.max === undefined && input.default !== null) {
        input.max = type === "int" ? Math.ceil(input.default * 5) : input.default * 5;
      }
      if (input.step === undefined) {
        input.step = type === "int" ? 1 : 0.1;
      }
    }

    inputs.push(input);
  }

  const simpleInputPattern = /(?:(?:int|float|bool|string|var)\s+)?(\w+)\s*=\s*input\s*\(([^)]+)\)/g;
  while ((match = simpleInputPattern.exec(code)) !== null) {
    const varName = match[1];
    if (inputs.find(i => i.name === varName)) continue;
    const argsStr = match[2];
    const { positional, keyword } = parseArgString(argsStr);
    const defaultVal = positional[0] || keyword["defval"] || "0";
    const isNum = !isNaN(Number(defaultVal));
    const isBool = defaultVal === "true" || defaultVal === "false";
    const type = isBool ? "bool" : isNum ? (defaultVal.includes(".") ? "float" : "int") : "string";

    const input: PineInput = {
      name: varName,
      type: type as PineInput["type"],
      default: parseDefault(defaultVal, type),
      label: keyword["title"] ? stripQuotes(keyword["title"]) : (positional[1] ? stripQuotes(positional[1]) : varName),
      optimizable: true,
    };

    if (keyword["minval"]) input.min = parseFloat(keyword["minval"]);
    if (keyword["maxval"]) input.max = parseFloat(keyword["maxval"]);
    if (keyword["step"]) input.step = parseFloat(keyword["step"]);
    if (keyword["options"]) input.options = parseOptionsArray(keyword["options"]);
    if (keyword["group"]) {
      input.group = keyword["group"].trim();
      input.groupLabel = groups[keyword["group"].trim()] || stripQuotes(keyword["group"].trim());
    }
    if (isDateRelated(varName, input.label)) {
      input.optimizable = false;
    }
    if ((type === "int" || type === "float") && input.min === undefined && input.default !== null) {
      input.min = type === "int" ? Math.max(1, Math.floor(input.default * 0.2)) : Math.max(0.01, input.default * 0.2);
      input.max = type === "int" ? Math.ceil(input.default * 5) : input.default * 5;
      input.step = type === "int" ? 1 : 0.1;
    }
    inputs.push(input);
  }

  return { inputs, groups, strategySettings };
}
