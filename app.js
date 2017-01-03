var SNIP_STR = "...";
var COL_CONTENT_LENGTH_MAX_DEFAULT = 32;

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
  if( includeZenkaku(s) ){
    var len = 0;
    for(var i=0,slen=s.length; i<slen; i++){
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
  for(var i=0; i<n; i++){
    ret += s;
  }
  return ret;
}

function padLeft(s, n){
  var pad = n - strlen(s);
  return s + mkstr(" ", pad);
}

function padRight(s, n){
  var pad = n - strlen(s);
  return mkstr(" ", pad) + s;
}

function mapChars(str, fn){
  var chars = [];
  for(var i=0,len=str.length; i<len; i++){
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

var SPAN_WS = mkSpanHtml(" ", "col_space");

var SPAN_CTRL_CD_MAP = {
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


function parse_regexp(text, options){
  var lines = text.split("\n");
  var re = options.re;
  return _.chain(lines).filter(function(line){
    return ! /^\s*$/.test(line);
  }).map(function(line){
    return line.split(re);
  }).value();
}

function parse_mysql(text){
  var lines = text.split("\n");
  return _.chain(lines).filter(function(line){
    return ! ( /^\+/.test(line)
               || /^\s*$/.test(line)
             );
  }).map(function(line){
    var cols = (" " + line + " ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip);
  }).value();
}

function parse_postgresql(text){
  var lines = text.split("\n");
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

function parse_gfm_table(text){
  var lines = text.split("\n");
  return _.chain(lines).filter(function(line){
    return ! ( /^\| ----/.test(line)
               || /^\s*$/.test(line)
             );
  }).map(function(line){
    var cols = (" " + line + " ").split(" | ");
    cols.shift();
    cols.pop();
    return cols.map(strip);
  }).value();
}

var AppM = Backbone.Model.extend({
  defaults: {
    input: "",
    rows: [],
    inputType: null, // regexp | mysql | postgresql | gfm_table
    regexpPattern: "\t",
    chkColNumber: false,
    customHeader: "",
    chkSnipLongCol: false,
    colContentLengthMax: COL_CONTENT_LENGTH_MAX_DEFAULT
  },

  parse: function(){
    var me = this;
    var text = this.get("input");

    switch(this.get("inputType")){
    case "mysql":
      this.rows = parse_mysql(text);
      break;
    case "postgresql":
      this.rows = parse_postgresql(text);
      break;
    case "gfm_table":
      this.rows = parse_gfm_table(text);
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
        maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col));
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

  toTsv: function(){
    var tsv = "";

    if( this.get("chkColNumber") ){
      tsv += this.headColsNumber.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }

    if( this.get("chkCustomHeader") ){
      tsv += this.headColsCustom.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }

    if( this.get("chkFirstRowHeader") ){
      tsv += this.headCols.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }

    tsv += _(this.bodyRows).map(function(cols){
      return cols.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }).join("");
    return tsv;
  },

  _colContentToHtml: function(content){
    var max = this.get("colContentLengthMax");
    if( content === "" ){
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
    var me = this;
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

  toGfmTable: function(){
    var numCols = this.getNumCols(this.rows);
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;

    var maxlens = this.getMaxlens(headCols).map(function(len){
      return Math.max(len, 3);
    });

    var s = "";
    s += "|";
    _(headCols).each(function(col, ci){
      s += " " + padLeft(col, maxlens[ci]) + " |";
    });
    s += "\n";

    s += "|";
    _(_.range(0, numCols)).each(function(ci){
      s += " " + mkstr("-", maxlens[ci]) + " |";
    });
    s += "\n";

    s += _(this.bodyRows).map(function(cols){
      var line = "|";
      _(cols).each(function(col, ci){
        line += " ";
        if( isNumber(col) ){
          line += padRight(col, maxlens[ci]);
        }else{
          line += padLeft(col, maxlens[ci]);
        }
        line += " |";
      });
      return line += "\n";
    }).join("");

    return s;
  },

  toSqlInsert: function(){
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;

    var s = "INSERT INTO {table}\n";

    s += "  (";
    s += headCols.join(", ");
    s += ")\nVALUES\n"

    s += _(this.bodyRows).map(function(cols, ri){
      var line = ""
      line += (ri === 0) ? "  " : " ,";
      line += "(";
      line += _(cols).map(function(col){
        return "'" + col + "'";
      }).join(", ");
      return line += ")\n";
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
    var me = this;

    this.$(".processing_indicator").show();

    this.model.parse();
    this.$(".output_json_array").val(this.model.toJsonArray());
    this.$(".output_json_object").val(this.model.toJsonObject());
    this.$(".output_tsv").val(this.model.toTsv());
    this.$(".output_gfm_table").val(this.model.toGfmTable());
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
});
