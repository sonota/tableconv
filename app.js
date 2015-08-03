function puts(){
  console.log.apply(console, arguments);
}

function escapeHtml(s){
  return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

function padLeft(s, n){
  var pad = n - strlen(s);
  var ret = s;
  for(var i=0; i<pad; i++){
    ret = ret + " ";
  }
  return ret;
}

function padRight(s, n){
  var pad = n - strlen(s);
  var ret = s;
  for(var i=0; i<pad; i++){
    ret = " " + ret;
  }
  return ret;
}

function mkstr(s, n){
  var ret = "";
  for(var i=0; i<n; i++){
    ret += s;
  }
  return ret;
}

var AppM = Backbone.Model.extend({
  defaults: {
    input: "",
    rows: [],
    inputType: null, // regexp | mysql | postgresql
    regexpPattern: "\t",
    chkColNumber: false,
    customHeader: ""
  },

  parse: function(){
    var me = this;
    var text = this.get("input");
    var lines = text.split("\n");

    switch(this.get("inputType")){
    case "mysql":
      this.rows = _.chain(lines).filter(function(line){
        return ! ( /^\+/.test(line)
                   || /^\s*$/.test(line)
                 );
      }).map(function(line){
        var cols = (" " + line + " ").split(" | ");
        cols.shift();
        cols.pop();
        return cols.map(strip);
      }).value();
      break;
    case "postgresql":
      this.rows = _.chain(lines).filter(function(line){
        return ! ( /^\-/.test(line)
                  || /^\s*$/.test(line)
                 );
      }).map(function(line){
        var cols = (" |" + line + " | ").split(" | ");
        cols.shift();
        cols.pop();
        return cols.map(strip);
      }).value();
      break;
    default:
      var re = new RegExp(me.get("regexpPattern"));
      this.rows = _(lines).map(function(line){
        return line.split(re);
      });
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

  hasCustomHeader: function(){
    return this.get("customHeader").length > 0;
  },

  getNumCols: function(rows){
    var numCols = 0;
    _(rows).each(function(cols){
      numCols = Math.max(numCols, cols.length);
    });
    return numCols;
  },

  toJsonArray: function(){
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;
    var json = '{"header":' + JSON.stringify(headCols);
    json += ', "rows": [\n';
    json += this.bodyRows.map(function(cols, i){
      return "  " + (i === 0 ? "" : "," ) + JSON.stringify(cols) + "\n";
    }).join("");
    json += ']';
    json += ']}';
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
    json += ']}';
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

  toHtmlTable: function(){
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
        h += '<td>' + escapeHtml(col) + '</td>';
      });
      h += '</tr>';
    });
    return h;
  },

  toGfmTable: function(){
    var numCols = this.getNumCols(this.rows);
    var headCols = this.headColsCustom || this.headCols || this.headColsNumber;

    var maxlens = [];
    _(this.rows).each(function(cols){
      _(cols).each(function(col, ci){
        maxlens[ci] = Math.max(maxlens[ci] || 0, strlen(col));
      });
    });
    maxlens = maxlens.map(function(len){
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
        if( col.match(/^-?[\d,]+$/) ){
          line += padRight(col, maxlens[ci]);
        }else{
          line += padLeft(col, maxlens[ci]);
        }
        line += " |";
      });
      return line += "\n";
    }).join("");

    return s;
  }
});

var AppV = Backbone.View.extend({
  initialize: function(){
    this.listenTo(this.model, "change", _.debounce(this.render, 200));

    this.model.set("inputType", this.getInputType(),
                   { silent: true });
    this.model.set("regexpPattern", this.$(".regexp_pattern").val(),
                   { silent: true });
    this.model.set("chkColNumber"
                   , this.$(".chk_col_number").prop("checked"),
                   { silent: true });
    this.model.set("customHeader",
                   this.getCustomHeader(),
                   { silent: true });
    this.model.set("chkCustomHeader"
                   , this.$(".chk_custom_header").prop("checked"),
                   { silent: true });
    this.model.set("chkFirstRowHeader"
                   , this.$(".chk_first_row_header").prop("checked"),
                   { silent: true });
    this.model.set("input", this.$(".input").val(), { silent: true });

    this.render();
  },

  events: {
    "input .input": "oninput_input",
    "change [name=input_type]": "onchange_inputType",
    "input .regexp_pattern": "oninput_regexpPattern",
    "change .chk_col_number": "onchange_chkColNumber",
    "input .custom_header": "oninput_customHeader",
    "change .chk_custom_header": "onchange_chkCustomHeader",
    "change .chk_first_row_header": "onchange_chkFirstRowHeader"
  },

  render: function(){
    var me = this;

    this.$(".processing_indicator").show();

    this.model.parse();
    this.$(".output_json_array").val(this.model.toJsonArray());
    this.$(".output_json_object").val(this.model.toJsonObject());
    this.$(".output_tsv").val(this.model.toTsv());
    this.$(".output_gfm_table").html(this.model.toGfmTable());
    this.$(".html_table").html(this.model.toHtmlTable());

    this.$(".regexp_pattern").prop(
      "disabled",
      this.model.get("inputType") !== "regexp");

    this.$(".custom_header").prop(
      "disabled",
      ! this.model.get("chkCustomHeader"));

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

  getInputType: function(){
    return this.$("[name=input_type]:checked").val();
  },

  getCustomHeader: function(){
    return this.$(".custom_header").val().split(",").map(strip);
  }
});

$(function(){
  var appM = new AppM();
  var appV = new AppV({
    model: appM,
    el: $("body")[0]
  });
});
