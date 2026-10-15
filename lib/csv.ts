export function parseCsv(text:string):string[][] {
  const rows:string[][]=[],row:string[]=[];let field="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===","&&!quoted){row.push(field);field="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(field);rows.push([...row]);row.length=0;field="";}
    else field+=c;
  }
  if(quoted)throw Error("Unclosed quotation in CSV file.");if(field||row.length){row.push(field);rows.push([...row]);}return rows;
}
