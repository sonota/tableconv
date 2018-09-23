const SNIP_STR = "...";
const NULL_STR = "NULL";
const COL_CONTENT_LENGTH_MAX_DEFAULT = 32;
const NUM_ROWS_MAX = 500;

function puts(){
  console.log.apply(console, arguments);
}

function strip(s){
  return s.replace(/^\s+|\s+$/g, "");
}

/**
 * http://winter-tail.sakura.ne.jp/pukiwiki/index.php?JavaScript%A4%A2%A4%EC%A4%B3%A4%EC%2F%C0%B5%B5%AC%C9%BD%B8%BD%A5%D1%A5%BF%A1%BC%A5%F3
 */
function includeZenkaku(s){
  return /[^ -~｡-ﾟ]/.test(s);
}

function strlen(s){
  if(s == null){
    return 0;
  }
  if( includeZenkaku(s) ){
    let len = 0;
    for(let i=0,slen=s.length; i<slen; i++){
      if( includeZenkaku(s.charAt(i)) ){
        len += 2;
      }else{
        len += 1;
      }
    }
    return len;
  }else{
    return s.length;
  }
}

function mkstr(s, n){
  let ret = "";
  for(let i=0; i<n; i++){
    ret += s;
  }
  return ret;
}

function padRight(s, n){
  const pad = n - strlen(s);
  return s + mkstr(" ", pad);
}

function padLeft(s, n){
  const pad = n - strlen(s);
  return mkstr(" ", pad) + s;
}

function mapChars(str, fn){
  const chars = [];
  for(let i=0,len=str.length; i<len; i++){
    chars.push(fn(str.charAt(i), i));
  }
  return chars;
}

function isNumber(s){
  return /^-?[\d,]+$/.test(s);
}

function mkSpanHtml(content, className){
  return '<span class="' + className + '">' + content + '</span>';
}

function sqlEscape(str){
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
  ;
}


const SPAN_WS = mkSpanHtml(" ", "col_space");

const SPAN_CTRL_CD_MAP = {
  "\\": mkSpanHtml("\\\\", "col_ctrl_cd"),
  "\b": mkSpanHtml("\\b", "col_ctrl_cd"),
  "\f": mkSpanHtml("\\f", "col_ctrl_cd"),
  "\n": mkSpanHtml("\\n", "col_ctrl_cd"),
  "\r": mkSpanHtml("\\r", "col_ctrl_cd"),
  "\t": mkSpanHtml("\\t", "col_ctrl_cd")
};


class StrScan {

  constructor(str){
    this.str = str;
    this.rest = this.str;
    this.pos = 0;
    this.posBom = 0; // beginning of match
    this.m = null; // match result
  }

  scan(re){
    this.posBom = this.pos;

    if( ! re.test(this.rest) ){
      this.m = null;
      return null;
    }

    const ret = this.rest.match(re);
    this.m = ret;
    this.movePos(ret[0].length);

    return true;
  }

  /**
   * EOS: end of string
   */
  isEos(){
    return this.pos >= this.str.length;
  }

  substring(i0, i1){
    return this.str.substring(i0, i1);
  }

  movePos(delta){
    this.pos += delta;
    this.rest = this.str.substring(this.pos);
  }
}


class ColContent {

  static _tokenize(str){
    // create token
    function _t(type, str){
      return { type: type, str: str };
    }

    const ts = [];
    let posPrevEom = 0; // previous end of match
    const ss = new StrScan(str);

    /**
     * \u0020: normal white space
     * \u00a0: nbsp
     */
    while( ! ss.isEos() ){
      if( ss.scan( /^[\u0020\u00a0]+/ ) ){
        if( posPrevEom < ss.posBom ){
          ts.push( _t("plain", ss.substring(posPrevEom, ss.posBom)) );
        }
        ts.push( _t("space", ss.m[0]) );
        posPrevEom = ss.pos;
      }else if( ss.scan(/^[\b\f\n\r\t\\]/) ){
        if( posPrevEom < ss.posBom ){
          ts.push( _t("plain", ss.substring(posPrevEom, ss.posBom)) );
        }
        ts.push( _t("ctrl_cd", ss.m[0]) );
        posPrevEom = ss.pos;
      }else{
        // 先頭にマッチするまでスキップ
        ss.movePos(1);
      }
    }

    if(posPrevEom < ss.pos){
      ts.push( _t("plain", ss.substring(posPrevEom, ss.pos)) );
    }

    return ts;
  }

  static _toHtml(tokens){
    return tokens.map((token)=>{
      if(token.type === 'space'){
        return mkstr(SPAN_WS, token.str.length);
      }else if(token.type === 'ctrl_cd'){
        return mapChars(token.str, function(c, i){
          return SPAN_CTRL_CD_MAP[c];
        }).join("");
      }else{
        return _.escape(token.str);
      }
    }).join("");
  }

  static toHtml(val){
    const tokens = this._tokenize(val);
    return this._toHtml(tokens);
  }
};


class Mrtable {
  static splitRow(line){
    const line2 = line + " ";
    const numRepeatMax = line2.length;
    let pos = 2;
    let posDelta = null;
    let rest = "";
    const cols = [];
    let buf = "";

    for( let i=0; i<numRepeatMax; i++ ){
      if( pos >= numRepeatMax ){ break; }
      posDelta = 1;
      rest = line2.substring(pos);
      if( /^ \| /.test(rest) ){
        cols.push(buf); buf = "";
        posDelta = 3;
      }else if( /^\\/.test(rest) ){
        if (rest[1] === "|") {
          buf += rest[1];
          posDelta = 2;
        }else{
          buf += rest[0];
          buf += rest[1];
          posDelta = 2;
        }
      }else{
        buf += rest[0];
      }
      pos += posDelta;
    }

    return cols;
  }

  static jsonEncode(val){
    const json = JSON.stringify([val]);
    if( json.match(/^\["(.*)"\]/) ){
      return RegExp.$1;
    }else if( json.match(/^\[(.*)\]/) ){
      return RegExp.$1;
    }else{
      return json;
    }
  }

  static jsonDecode(str){
    if( /^".*"$/.test(str) ){
      return JSON.parse('[' + str + ']')[0];
    }else{
      return JSON.parse('["' + str + '"]')[0];
    }
  }

  static parseCol(col){
    if( col === "" ){
      return null;
    }else if( col === '""' ){
      return "";
    }else{
      return Mrtable.jsonDecode(col);
    }
  }

  static parse(text){
    const lines = text.split(/\r?\n/);
    if( lines.length > NUM_ROWS_MAX ){
      throw new Error("Too many rows");
    }

    return lines.filter((line)=>{
      return ! ( /^\| \-\-\-+/.test(line)
                 || /^\s*$/.test(line)
               );
    }).map((line)=>{
      const cols = Mrtable.splitRow(line);
      const cols_stripped = cols.map(strip);
      const cols_parsed = cols_stripped.map(Mrtable.parseCol);
      return cols_parsed;
    });
  }

  static mapCol(rows, fn){
    return rows.map((cols)=>{
      return cols.map(fn);
    });
  }

  static serealizeCol(col){
    if( col == null ){
      return "";
    }else if( col === "" ){
      return '""';
    }

    let ret = Mrtable.jsonEncode(col);
    if( /^\s+/.test(ret) || /\s+$/.test(ret)
        || /^\-+$/.test(ret)
      ){
      ret = '"' + ret + '"';
    }
    return ret.replace(/\|/g, "\\|");
  }

  static colLen(col){
    return strlen(col);
  }

  static calcMaxlens(rows){
    const numCols = rows[0].length;
    const maxlens = [];
    for( let ci=0; ci<numCols; ci++ ){
      const colsAtCi = rows.map((cols)=>{ return cols[ci]; })
      const lens = colsAtCi.map((col)=>{
        return Mrtable.colLen(col);
      });
      maxlens.push(Math.max.apply(null, lens));
    }
    return maxlens.map((len)=>{ return Math.max(len, 3); });
  }

  static padCol(col, maxlen){
    if( col.match(/^\-?\d+$/) ){
      return padLeft(col, maxlen);
    }else{
      return padRight(col, maxlen);
    }
  }

  static generate(rows, headCols){
    function cols2line(cols){
      return "| " + cols.join(" | ") + " |";
    }

    const unioned = [headCols].concat(rows);

    const numCols = headCols.length;
    const serealized = Mrtable.mapCol(unioned, Mrtable.serealizeCol);
    const maxlens = Mrtable.calcMaxlens(serealized);
    const padded = Mrtable.mapCol(serealized, (col, ci)=>{
      return Mrtable.padCol(col, maxlens[ci]);
    });

    let lines = [];

    const headCols2 = padded[0];
    const rows2 = padded.slice(1);

    lines.push(cols2line(headCols2));

    const seps = _.range(0, numCols).map((ci)=>{
      return mkstr("-", maxlens[ci]);
    });
    lines.push(cols2line(seps));

    rows2.forEach((cols)=>{
      lines.push(cols2line(cols));
    });
    return lines.map(line => line + "\n").join("");
  }
}

function mapColWithCi(rows, fn){
  return rows.map((cols)=>{
    return cols.map((col, ci)=>{
      return fn(col, ci);
    });
  });
}

function parse_regexp(text, options){
  const lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    throw new Error("Too many rows");
  }

  const re = options.re;
  const source = re.toSource();
  if(
    source === "/(?:)/" // empty
    || source === "/./"
    ){
    throw new Error("Invalid regexp pattern");
  }

  const rows = lines.filter((line)=>{
    return ! /^\s*$/.test(line);
  }).map((line)=>{
    return line.split(re);
  });

  if("customNullStrIn" in options){
    const nullStr = options.customNullStrIn
    return mapColWithCi(rows, (col, ci)=>{
      return col === nullStr ? null : col;
    });
  }else{
    return rows;
  }
}

function parse_mysql(text){
  const lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    throw new Error("Too many rows");
  }

  return lines.filter((line)=>{
    return ! ( /^\+/.test(line)
               || /^\s*$/.test(line)
             );
  }).map((line)=>{
    let cols = (" " + line + " ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip).map((x)=>{
      return x === 'NULL' ? null : x;
    });
  });
}

function parse_postgresql(text){
  const lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    throw new Error("Too many rows");
  }

  return lines.filter((line)=>{
    return ! ( /^\-/.test(line)
               || /^\s*$/.test(line)
             );
  }).map((line)=>{
    let cols = (" |" + line + " | ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip);
  });
}

function parse_mrtable(text, options){
  const rows = Mrtable.parse(text);

  if("customNullStrIn" in options){
    const nullStr = options.customNullStrIn;
    return mapColWithCi(rows, (col, ci)=>{
      return col === nullStr ? null : col;
    });
  }else{
    return rows;
  }
}

const AppM = Backbone.Model.extend({
  defaults: {
    input: "",
    rows: [],
    inputType: null, // regexp | mysql | postgresql | mrtable
    regexpPattern: "\t",
    chkColNumber: false,
    customHeader: "",
    chkSnipLongCol: false,
    colContentLengthMax: COL_CONTENT_LENGTH_MAX_DEFAULT
  },

  parse: function(){

    function dispatch(me, text){
      const options = {};
      if( me.get("chkCustomNullStrIn") ){
        options.customNullStrIn = me.get("customNullStrIn");
      }

      switch(me.get("inputType")){
      case "mysql":
        return parse_mysql(text);
        break;
      case "postgresql":
        return parse_postgresql(text);
        break;
      case "mrtable":
        return parse_mrtable(text, options);
        break;
      default:
        options.re = new RegExp(me.get("regexpPattern"));
        return parse_regexp(text, options);
      }
    }

    const me = this;
    const text = this.get("input");

    try{
      this.rows = dispatch(me, text);
    }catch(e){
      puts(e);
      this.rows = [[]];
    }

    let bodyRows = this.rows;
    const numCols = this.getNumCols(this.rows);

    this.headColsNumber = _.range(0, numCols).map(function(ci){
      return "" + (ci + 1);
    });
    this.headCols = null;
    this.headColsCustom = null;

    if( this.get("chkFirstRowHeader") ){
      this.headCols = this.rows[0];
      bodyRows = this.rows.slice(1);
    }
    if( this.get("chkCustomHeader") ){
      this.headColsCustom = this.get("customHeader");
    }
    this.bodyRows = bodyRows;
  },

  getNumCols: function(rows){
    let numCols = 0;
    rows.forEach(function(cols){
      numCols = Math.max(numCols, cols.length);
    });
    return numCols;
  },

  getMaxlens: function(headCols){
    const maxlens = [];
    headCols.forEach(function(col, ci){
      maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col));
    });
    this.bodyRows.forEach(function(cols){
      cols.forEach(function(col, ci){
        maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col || NULL_STR));
      });
    });
    return maxlens;
  },

  // for customization
  modifyHeadCol: function(col){
    if(this.get("chkOmitTableName")){
      const i = col.indexOf(".");
      if(i >= 1){
        return col.substring(i + 1);
      }else{
        return col;
      }
    }else{
      return col;
    }
  },

  toJsonArray: function(){
    const me = this;
    let headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    headCols = headCols.map((col)=>{ return me.modifyHeadCol(col); });

    let json = '{"header":' + JSON.stringify(headCols);
    json += ', "rows": [\n';
    json += this.bodyRows.map(function(cols, i){
      return "  " + (i === 0 ? "" : "," ) + JSON.stringify(cols) + "\n";
    }).join("");
    json += ']';
    json += '}';
    return json;
  },

  toJsonObject: function(){
    const me = this;
    let headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    headCols = headCols.map((col)=>{ return me.modifyHeadCol(col); });

    let json = '{"header":' + JSON.stringify(headCols);
    json += ', "rows": [\n';
    json += this.bodyRows.map(function(cols, i){
      const obj = {};
      cols.forEach((col, ci)=>{
        obj[headCols[ci]] = col;
      });
      return "  " + (i === 0 ? "" : "," ) + JSON.stringify(obj) + "\n";
    }).join("");
    json += ']';
    json += '}';
    return json;
  },

  toTsvRow: function(cols){
    // quote by double quote
    return cols.map(JSON.stringify).join("\t");
  },

  toTsv: function(){
    const me = this;
    let tsv = "";

    if( this.get("chkColNumber") ){
      tsv += this.toTsvRow(this.headColsNumber) + "\n";
    }

    if( this.get("chkCustomHeader") ){
      tsv += this.toTsvRow(this.headColsCustom) + "\n";
    }

    if( this.get("chkFirstRowHeader") ){
      const headCols = this.headCols.map((col)=>{ return me.modifyHeadCol(col); });
      tsv += this.toTsvRow(headCols) + "\n";
    }

    let bodyRows = this.bodyRows;
    if( this.get("chkCustomNullStrOut") ){
      const nullStr = this.get("customNullStrOut");
      bodyRows = mapColWithCi(bodyRows, (col, ci)=>{
        return col === null ? nullStr : col;
      });
    }

    tsv += bodyRows.map((cols)=>{
      return me.toTsvRow(cols) + "\n";
    }).join("");
    return tsv;
  },

  _colContentToHtml: function(content){
    const max = this.get("colContentLengthMax");
    if( content == null ){
      return mkSpanHtml("(null)", "col_null");
    }else if( content === "" ){
      return mkSpanHtml("(empty)", "col_empty");
    }else if( this.get("chkSnipLongCol")
        && content.length > max
      ){
      const half = Math.floor( (max - SNIP_STR.length) / 2 );
      const head = content.substring(0, half);
      const tail = content.substring(content.length - half, content.length);
      return ColContent.toHtml(head)
          + mkSpanHtml(SNIP_STR, "col_snip")
          + ColContent.toHtml(tail);
    }else{
      return ColContent.toHtml(content);
    }
  },

  toHtmlTable: function(){
    const me = this;
    let h = "";

    h += '<tr><th>#</th>' + this.headColsNumber.map(function(col){
      return '<th>' + col + '</th>';
    }) + '</tr>';

    if( this.get("chkCustomHeader") ){
      h += '<tr><th>custom</th>' + this.headColsCustom.map(function(col){
        return '<th>' + col + '</th>';
      }) + '</tr>';
    }

    if( this.get("chkFirstRowHeader") ){
      const headCols = this.headCols.map((col)=>{ return me.modifyHeadCol(col); });
      h += '<tr><th>1st row</th>' + headCols.map(function(col){
        return '<th>' + col + '</th>';
      }) + '</tr>';
    }

    this.bodyRows.forEach((cols, ri)=>{
      h += '<tr>';
      h += '<th>' + (ri + 1) + '</th>';
      cols.forEach((col)=>{
        if( isNumber(col) ){
          h += '<td class="right">';
        }else{
          h += '<td>';
        }
        h += me._colContentToHtml(col) + '</td>';
      });
      h += '</tr>';
    });
    return h;
  },

  toMrtable: function(){
    const me = this;
    let headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    headCols = headCols.map((col)=>{ return me.modifyHeadCol(col); });

    let bodyRows = this.bodyRows;
    if( this.get("chkCustomNullStrOut") ){
      const nullStr = this.get("customNullStrOut");
      bodyRows = mapColWithCi(bodyRows, (col, ci)=>{
        return col === null ? nullStr : col;
      });
    }

    return Mrtable.generate(bodyRows, headCols);
  },

  toSqlInsert: function(){
    function convertCol(col){
      if( col == null ){
        return "NULL";
      }else if( col.match(/^now\(\)$/i) ){
        return "NOW()";
      }else{
        return "'" + sqlEscape(col) + "'";
      }
    }

    function calcMaxlens(rows){
      const maxlens = [];
      const numCols = rows[0].length;
      for( let ci=0; ci<numCols; ci++ ){
        const colsAtCi = [];
        rows.forEach((cols)=>{
          colsAtCi.push(cols[ci]);
        });
        maxlens[ci] = Math.max.apply(null, colsAtCi.map(strlen));
      }
      return maxlens;
    }

    const me = this;
    let headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    headCols = headCols.map((col)=>{ return me.modifyHeadCol(col); });

    const unioned = [headCols].concat(this.bodyRows);
    const serealized = unioned.map((cols)=>{
      return cols.map(convertCol);
    });

    const maxlens = calcMaxlens(serealized);

    const padded = serealized.map((cols)=>{
      return cols.map((col, ci)=>{
        return padRight(col, maxlens[ci]);
      });
    });

    const headCols2 = padded[0].map((col)=>{
      // 両側の single quote を取る
      col.match(/^'(.+)'( *)$/);
      return " " + RegExp.$1 + " " + RegExp.$2;
    });
    const bodyRows2 = padded.slice(1);

    const tableName = me.get("tableName") || "{table}";

    let s = "INSERT INTO " + tableName + "\n";

    s += "  (";
    s += headCols2.join(", ");
    s += ")\nVALUES\n";

    s += bodyRows2.map((cols, ri)=>{
      return ((ri === 0) ? "  " : " ,")
        + "(" + cols.join(", ") + ")\n";
    }).join("");

    return s + ";\n";
  }
});

const AppV = Backbone.View.extend({
  initialize: function(){
    this.listenTo(this.model, "change", _.debounce(this.render, 200));

    this.model.set(
      {
        "inputType": this.getInputType(),
        "regexpPattern": this.$(".regexp_pattern").val(),
        "chkColNumber": this.$(".chk_col_number").prop("checked"),
        "customHeader": this.getCustomHeader(),
        "chkCustomHeader": this.$(".chk_custom_header").prop("checked"),
        "chkFirstRowHeader": this.$(".chk_first_row_header").prop("checked"),
        "chkOmitTableName": this.$(".chk_omit_table_name").prop("checked"),
        "input": this.$(".input").val(),
        "chkSnipLongCol": this.$(".chk_snip_long_col").prop("checked"),

        "chkCustomNullStrIn": this.$(".chk_custom_null_str_in").prop("checked"),
        "customNullStrIn": this.$(".custom_null_str_in").val(),

        "chkCustomNullStrOut": this.$(".chk_custom_null_str_out").prop("checked"),
        "customNullStrOut": this.$(".custom_null_str_out").val(),

        "tableName": this.$(".table_name").val(),

        "colContentLengthMax": this.getColContentLengthMax()
      },
      { silent: true }
    );

    this.render();
  },

  events: {
    "input .input": "oninput_input",
    "change [name=input_type]": "onchange_inputType",
    "input .regexp_pattern": "oninput_regexpPattern",
    "change .chk_col_number": "onchange_chkColNumber",
    "input .custom_header": "oninput_customHeader",
    "change .chk_custom_header": "onchange_chkCustomHeader",
    "change .chk_first_row_header": "onchange_chkFirstRowHeader",
    "change .chk_omit_table_name": "onchange_chkOmitTableName",
    "change .chk_snip_long_col": "onchange_chkSnipLongCol",

    "change .chk_custom_null_str_in": "onchange_chkCustomNullStrIn",
    "change .custom_null_str_in": "onchange_customNullStrIn",

    "change .chk_custom_null_str_out": "onchange_chkCustomNullStrOut",
    "change .custom_null_str_out": "onchange_customNullStrOut",

    "change .table_name": "onchange_tableName",

    "change .col_content_length_max": "onchange_colContentLengthMax"
  },

  render: function(){
    const me = this;

    this.$(".processing_indicator").show();

    this.model.parse();
    this.$(".output_json_array").val(this.model.toJsonArray());
    this.$(".output_json_object").val(this.model.toJsonObject());
    this.$(".output_tsv").val(this.model.toTsv());
    this.$(".output_mrtable").val(this.model.toMrtable());
    this.$(".output_sql_insert").val(this.model.toSqlInsert());
    this.$(".html_table").html(this.model.toHtmlTable());

    this.$(".regexp_pattern").prop(
      "disabled",
      this.model.get("inputType") !== "regexp");

    this.$(".custom_header").prop(
      "disabled",
      ! this.model.get("chkCustomHeader"));

    this.$(".chk_first_row_header").prop(
      "checked",
      this.model.get("chkFirstRowHeader"));

    this.$(".chk_omit_table_name").prop(
      "checked",
      this.model.get("chkOmitTableName"));

    this.$(".col_content_length_max").prop(
      "disabled",
      ! this.model.get("chkSnipLongCol"));

    this.$(".custom_null_str_in").prop(
      "disabled",
      ! this.model.get("chkCustomNullStrIn"));

    this.$(".custom_null_str_out").prop(
      "disabled",
      ! this.model.get("chkCustomNullStrOut"));

    this.$(".col_content_length_max").val(this.model.get("colContentLengthMax"));

    setTimeout(function(){
      me.$(".processing_indicator").hide();
    }, 500);

    return this;
  },

  oninput_input: function(){
    this.model.set("input", this.$(".input").val());
  },

  onchange_inputType: function(){
    this.model.set("inputType", this.getInputType());
  },

  oninput_regexpPattern: function(){
    this.model.set("regexpPattern", this.$(".regexp_pattern").val());
  },

  onchange_chkColNumber: function(){
    this.model.set("chkColNumber", this.$(".chk_col_number").prop("checked"));
  },

  oninput_customHeader: function(){
    this.model.set("customHeader", this.getCustomHeader());
  },

  onchange_chkCustomHeader: function(){
    this.model.set(
      "chkCustomHeader",
      this.$(".chk_custom_header").prop("checked"));
  },

  onchange_chkFirstRowHeader: function(){
    this.model.set(
      "chkFirstRowHeader",
      this.$(".chk_first_row_header").prop("checked"));
  },

  onchange_chkOmitTableName: function(){
    this.model.set(
      "chkOmitTableName",
      this.$(".chk_omit_table_name").prop("checked"));
  },

  onchange_chkSnipLongCol: function(){
    this.model.set(
      "chkSnipLongCol",
      this.$(".chk_snip_long_col").prop("checked"));
  },

  onchange_chkCustomNullStrIn: function(){
    this.model.set(
      "chkCustomNullStrIn",
      this.$(".chk_custom_null_str_in").prop("checked"));
  },

  onchange_customNullStrIn: function(){
    this.model.set(
      "customNullStrIn",
      this.$(".custom_null_str_in").val());
  },

  onchange_chkCustomNullStrOut: function(){
    this.model.set(
      "chkCustomNullStrOut",
      this.$(".chk_custom_null_str_out").prop("checked"));
  },

  onchange_customNullStrOut: function(){
    this.model.set(
      "customNullStrOut",
      this.$(".custom_null_str_out").val());
  },

  onchange_tableName: function(){
    this.model.set(
      "tableName",
      this.$(".table_name").val());
  },

  onchange_colContentLengthMax: function(){
    this.model.set(
      "colContentLengthMax",
      this.getColContentLengthMax());
    this.model.trigger("change:colContentLengthMax");
  },

  getInputType: function(){
    return this.$("[name=input_type]:checked").val();
  },

  getCustomHeader: function(){
    return this.$(".custom_header").val().split(",").map(strip);
  },

  getColContentLengthMax: function(){
    const n = parseInt(this.$(".col_content_length_max").val(), 10);
    if(isNaN(n)){
      return COL_CONTENT_LENGTH_MAX_DEFAULT;
    }
    if(n < SNIP_STR.length + 2){
      return SNIP_STR.length + 2;
    }
    return n;
  }
});

$(function(){
  const appM = new AppM();
  const appV = new AppV({
    model: appM,
    el: $("body")[0]
  });

  if( /\?test=1$/.test(location.href) ){
    const el = document.createElement("script");
    el.setAttribute("src", "./test.js");
    const body = document.querySelector("body");
    body.appendChild(el);
    $(el).on("load", ()=>{
      _test();
    });
  }
});
