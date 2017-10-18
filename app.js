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
    var len = 0;
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
  var ret = "";
  for(let i=0; i<n; i++){
    ret += s;
  }
  return ret;
}

function padRight(s, n){
  var pad = n - strlen(s);
  return s + mkstr(" ", pad);
}

function padLeft(s, n){
  var pad = n - strlen(s);
  return mkstr(" ", pad) + s;
}

function mapChars(str, fn){
  var chars = [];
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
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
  ;
}


const SPAN_WS = mkSpanHtml(" ", "col_space");

const SPAN_CTRL_CD_MAP = {
  "\\": mkSpanHtml("\\\\", "col_ctrl_cd"),
  "\r": mkSpanHtml("\\r", "col_ctrl_cd"),
  "\n": mkSpanHtml("\\n", "col_ctrl_cd"),
  "\t": mkSpanHtml("\\t", "col_ctrl_cd")
};


var StrScan = (function(){

  function StrScan(str){
    this.str = str;
    this.rest = this.str;
    this.pos = 0;
    this.posBom = 0; // beginning of match
    this.m = null; // match result
  }
  var __ = StrScan.prototype;

  __.scan = function(re){
    this.posBom = this.pos;

    if( ! re.test(this.rest) ){
      this.m = null;
      return null;
    }

    var ret = this.rest.match(re);
    this.m = ret;
    this.movePos(ret[0].length);

    return true;
  };

  /**
   * EOS: end of string
   */
  __.isEos = function(){
    return this.pos >= this.str.length;
  };

  __.substring = function(i0, i1){
    return this.str.substring(i0, i1);
  };

  __.movePos = function(delta){
    this.pos += delta;
    this.rest = this.str.substring(this.pos);
  };

  return StrScan;
})();


var ColContent = {
  _tokenize: function(str){
    // create token
    function _t(type, str){
      return { type: type, str: str };
    }

    var ts = [];
    var posPrevEom = 0; // previous end of match
    var ss = new StrScan(str);

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
      }else if( ss.scan(/^[\t\r\n\\]/) ){
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
  },

  _toHtml: function(tokens){
    return _.map(tokens, function(token){
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
  },

  toHtml: function(val){
    var tokens = this._tokenize(val);
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
    const NULL_STR = "null";
    if( col === '"' + NULL_STR + '"' ){
      return NULL_STR;
    }else if( col === NULL_STR ){
      return null;
    }else{
      return Mrtable.jsonDecode(col);
    }
  }

  static parse(text){
    var lines = text.split(/\r?\n/);
    if( lines.length > NUM_ROWS_MAX ){
      alert("Too many rows");
      return [];
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
      return "null";
    }else if( col === "null" ){
      return '"null"'
    }

    const ret = Mrtable.jsonEncode(col);
    if( ret === "" ){
      return '""';
    }else if( ret.match(/^\s+/) || ret.match(/\s+$/) ){
      return '"' + ret + '"';
    }else{
      return ret.replace(/\|/g, "\\|");
    }
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

    lines.push("| " + headCols2.join(" | ") + " |");

    const seps = _.range(0, numCols).map((ci)=>{
      return mkstr("-", maxlens[ci]);
    });
    lines.push("| " + seps.join(" | ") + " |");

    rows2.forEach((cols)=>{
      lines.push("| " + cols.join(" | ") + " |");
    });
    return lines.map(line => line + "\n").join("");
  }
}


function parse_regexp(text, options){
  var lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    alert("Too many rows");
    return [];
  }

  var re = options.re;
  return _.chain(lines).filter(function(line){
    return ! /^\s*$/.test(line);
  }).map(function(line){
    return line.split(re);
  }).value();
}

function parse_mysql(text){
  var lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    alert("Too many rows");
    return [];
  }

  return _.chain(lines).filter(function(line){
    return ! ( /^\+/.test(line)
               || /^\s*$/.test(line)
             );
  }).map(function(line){
    var cols = (" " + line + " ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip).map((x)=>{
      return x === 'NULL' ? null : x;
    });
  }).value();
}

function parse_postgresql(text){
  var lines = text.split("\n");
  if(lines.length > NUM_ROWS_MAX){
    alert("Too many rows");
    return [];
  }

  return _.chain(lines).filter(function(line){
    return ! ( /^\-/.test(line)
               || /^\s*$/.test(line)
             );
  }).map(function(line){
    var cols = (" |" + line + " | ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip);
  }).value();
}

function parse_mrtable(text){
  return Mrtable.parse(text);
}

var AppM = Backbone.Model.extend({
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
    const me = this;
    var text = this.get("input");

    switch(this.get("inputType")){
    case "mysql":
      this.rows = parse_mysql(text);
      break;
    case "postgresql":
      this.rows = parse_postgresql(text);
      break;
    case "mrtable":
      this.rows = parse_mrtable(text);
      break;
    default:
      var re = new RegExp(me.get("regexpPattern"));
      this.rows = parse_regexp(text, { re: re });
    }

    var bodyRows = this.rows;
    var numCols = this.getNumCols(this.rows);

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
    var numCols = 0;
    _(rows).each(function(cols){
      numCols = Math.max(numCols, cols.length);
    });
    return numCols;
  },

  getMaxlens: function(headCols){
    var maxlens = [];
    _(headCols).each(function(col, ci){
      maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col));
    });
    _(this.bodyRows).each(function(cols){
      _(cols).each(function(col, ci){
        maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col || NULL_STR));
      });
    });
    return maxlens;
  },

  toJsonArray: function(){
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    var json = '{"header":' + JSON.stringify(headCols);
    json += ', "rows": [\n';
    json += this.bodyRows.map(function(cols, i){
      return "  " + (i === 0 ? "" : "," ) + JSON.stringify(cols) + "\n";
    }).join("");
    json += ']';
    json += '}';
    return json;
  },

  toJsonObject: function(){
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    var json = '{"header":' + JSON.stringify(headCols);
    json += ', "rows": [\n';
    json += this.bodyRows.map(function(cols, i){
      var obj = {};
      _(cols).each(function(col, ci){
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
    var tsv = "";

    if( this.get("chkColNumber") ){
      tsv += this.toTsvRow(this.headColsNumber) + "\n";
    }

    if( this.get("chkCustomHeader") ){
      tsv += this.toTsvRow(this.headColsCustom) + "\n";
    }

    if( this.get("chkFirstRowHeader") ){
      tsv += this.toTsvRow(this.headCols) + "\n";
    }

    tsv += _(this.bodyRows).map(function(cols){
      return me.toTsvRow(cols) + "\n";
    }).join("");
    return tsv;
  },

  _colContentToHtml: function(content){
    var max = this.get("colContentLengthMax");
    if( content == null ){
      return mkSpanHtml("(null)", "col_null");
    }else if( content === "" ){
      return mkSpanHtml("(empty)", "col_empty");
    }else if( this.get("chkSnipLongCol")
        && content.length > max
      ){
      var half = Math.floor( (max - SNIP_STR.length) / 2 );
      var head = content.substring(0, half);
      var tail = content.substring(content.length - half, content.length);
      return ColContent.toHtml(head)
          + mkSpanHtml(SNIP_STR, "col_snip")
          + ColContent.toHtml(tail);
    }else{
      return ColContent.toHtml(content);
    }
  },

  toHtmlTable: function(){
    const me = this;
    var h = "";

    h += '<tr><th>#</th>' + this.headColsNumber.map(function(col){
      return '<th>'+col+'</th>';
    }) + '</tr>';

    if( this.get("chkCustomHeader") ){
      h += '<tr><th>custom</th>' + this.headColsCustom.map(function(col){
        return '<th>'+col+'</th>';
      }) + '</tr>';
    }

    if( this.get("chkFirstRowHeader") ){
      h += '<tr><th>1st row</th>' + this.headCols.map(function(col){
        return '<th>'+col+'</th>';
      }) + '</tr>';
    }

    _(this.bodyRows).each(function(cols, ri){
      h += '<tr>';
      h += '<th>' + (ri + 1) + '</th>';
      _(cols).each(function(col){
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
    var numCols = this.getNumCols(this.rows);
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    return Mrtable.generate(this.bodyRows, headCols);
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

    const headCols = this.headColsCustom || this.headCols || this.headColsNumber;

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

    let s = "INSERT INTO {table}\n";

    s += "  (";
    s += headCols2.join(", ");
    s += ")\nVALUES\n";

    s += bodyRows2.map(function(cols, ri){
      return ((ri === 0) ? "  " : " ,")
        + "(" + cols.join(", ") + ")\n";
    }).join("");

    return s + ";\n";
  }
});

var AppV = Backbone.View.extend({
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
        "input": this.$(".input").val(),
        "chkSnipLongCol": this.$(".chk_snip_long_col").prop("checked"),
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
    "change .chk_snip_long_col": "onchange_chkSnipLongCol",
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

    this.$(".col_content_length_max").prop(
      "disabled",
      ! this.model.get("chkSnipLongCol"));

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

  onchange_chkSnipLongCol: function(){
    this.model.set(
      "chkSnipLongCol",
      this.$(".chk_snip_long_col").prop("checked"));
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
    var n = parseInt(this.$(".col_content_length_max").val(), 10);
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
  var appM = new AppM();
  var appV = new AppV({
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
