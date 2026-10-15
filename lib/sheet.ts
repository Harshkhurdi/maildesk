export function colName(n: number): string { let s=""; for(n++;n>0;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }

type CellResult = string | number;
const MAX_OPERATIONS = 50000;
const MAX_DEPTH = 80;
const REFERENCE = /^\$?([A-Z]+)\$?([1-9]\d*)$/;

/** Reuse this calculator only while the supplied cells snapshot is unchanged. */
export function createSheetCalculator(cells: Record<string,string>) {
  const cache = new Map<string,CellResult>();
  return (key: string, chain: string[] = []): CellResult => {
    let operations = 0;
    const visiting = new Set(chain);
    function spend() { if (++operations > MAX_OPERATIONS) throw Error("#LIMIT!"); }
    function read(address: string, depth: number): CellResult {
      spend();
      if (visiting.has(address)) return "#CYCLE!";
      if (depth > MAX_DEPTH) return "#LIMIT!";
      if (cache.has(address)) return cache.get(address)!;
      const raw = cells[address] ?? "";
      if (!raw.startsWith("=")) {
        const value = raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
        cache.set(address,value);
        return value;
      }
      visiting.add(address);
      let value: CellResult;
      try { value = evaluate(raw.slice(1).toUpperCase(),depth + 1); }
      catch (error) { value = error instanceof Error && error.message.startsWith("#") ? error.message : "#ERROR!"; }
      finally { visiting.delete(address); }
      // A limit is specific to this lookup's remaining budget, not the cell itself.
      if (value !== "#LIMIT!" && value !== "#CYCLE!") cache.set(address,value);
      return value;
    }
    function reference(token: string): string {
      const match = token.match(REFERENCE);
      if (!match) throw Error("#REF!");
      return match[1] + match[2];
    }
    function numeric(value: CellResult): number {
      if (typeof value === "string" && value.startsWith("#")) throw Error(value);
      if (value === "") return 0;
      if (!Number.isFinite(Number(value))) throw Error("#VALUE!");
      return Number(value);
    }
    function evaluate(source: string, depth: number): number {
      const tokens = source.match(/\d*\.?\d+(?:E[+-]?\d+)?|\$?[A-Z]+\$?\d+|[A-Z]+|[()+\-*/,:]/g) ?? [];
      if (tokens.join("") !== source.replace(/\s/g,"")) throw Error("#ERROR!");
      let pos = 0;
      function primary(): number {
        spend();
        const token = tokens[pos++];
        if (!token) throw Error("#ERROR!");
        if (token === "-") return -primary();
        if (token === "+") return primary();
        if (token === "(") { const value = expression(); if (tokens[pos++] !== ")") throw Error("#ERROR!"); return value; }
        if (/^\d|^\./.test(token)) return Number(token);
        if (/^\$?[A-Z]+\$?\d+$/.test(token)) return numeric(read(reference(token),depth));
        if (!["SUM","AVERAGE","MIN","MAX","COUNT"].includes(token) || tokens[pos++] !== "(") throw Error("#NAME?");
        const values: number[] = [];
        function addCell(address: string) {
          const value = read(address,depth);
          if (typeof value === "string" && value.startsWith("#")) throw Error(value);
          if (typeof value === "number") values.push(value);
        }
        while (tokens[pos] !== ")") {
          const current = tokens[pos] ?? "";
          if (/^\$?[A-Z]+\$?\d+$/.test(current) && tokens[pos+1] === ":") {
            const start = reference(current), end = reference(tokens[pos+2] ?? "");
            pos += 3;
            const a = start.match(/^([A-Z]+)(\d+)$/)!, b = end.match(/^([A-Z]+)(\d+)$/)!;
            const column = (name: string) => [...name].reduce((value,char) => value*26 + char.charCodeAt(0)-64,0)-1;
            const x1 = column(a[1]), x2 = column(b[1]), y1 = Number(a[2]), y2 = Number(b[2]);
            if (!Number.isSafeInteger(x1) || !Number.isSafeInteger(x2) || !Number.isSafeInteger(y1) || !Number.isSafeInteger(y2) || x2 < x1 || y2 < y1 || (x2-x1+1)*(y2-y1+1) > 5000) throw Error("#REF!");
            for (let row=y1;row<=y2;row++) for (let col=x1;col<=x2;col++) addCell(colName(col)+row);
          } else if (/^\$?[A-Z]+\$?\d+$/.test(current) && [",",")"].includes(tokens[pos+1])) {
            pos++;
            addCell(reference(current));
          } else values.push(expression());
          if (tokens[pos] === ",") { pos++; if (tokens[pos] === ")") throw Error("#ERROR!"); continue; }
          if (tokens[pos] !== ")") throw Error("#ERROR!");
        }
        pos++;
        if (token === "SUM") return values.reduce((sum,value) => sum+value,0);
        if (token === "COUNT") return values.length;
        if (!values.length) { if (token === "AVERAGE") throw Error("#DIV/0!"); return 0; }
        if (token === "AVERAGE") return values.reduce((sum,value) => sum+value,0)/values.length;
        if (token === "MIN") return Math.min(...values);
        return Math.max(...values);
      }
      function term(): number {
        let value = primary();
        while (["*","/"].includes(tokens[pos])) {
          const operator = tokens[pos++], next = primary();
          if (operator === "/" && next === 0) throw Error("#DIV/0!");
          value = operator === "*" ? value*next : value/next;
        }
        return value;
      }
      function expression(): number {
        let value = term();
        while (["+","-"].includes(tokens[pos])) {
          const operator = tokens[pos++], next = term();
          value = operator === "+" ? value+next : value-next;
        }
        return value;
      }
      const answer = expression();
      if (pos !== tokens.length || !Number.isFinite(answer)) throw Error("#ERROR!");
      return answer;
    }
    try { return read(key,chain.length); }
    catch (error) { return error instanceof Error && error.message.startsWith("#") ? error.message : "#ERROR!"; }
  };
}

export function cellValue(key: string, cells: Record<string,string>, chain: string[] = []): CellResult {
  return createSheetCalculator(cells)(key,chain);
}
