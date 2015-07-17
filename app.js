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

var AppM = Backbone.Model.extend({
  defaults: {
    input: "",
    rows: [],
    inputType: null, // regexp | mysql | postgresql
    headerCols: ""
  },

  parse: function(){
    var me = this;
    var text = this.get("input");
    var lines = text.split("\n");

    switch(this.get("inputType")){
    case "mysql":
      this.rows = _.chain(lines).filter(function(line){
        return ! line.match( /^\+/ );
      }).map(function(line){
        var cols = (" " + line + " ").split(" | ");
        cols.shift();
        cols.pop();
        return cols;
      });
      break;
    case "postgresql":
      this.rows = _.chain(lines).filter(function(line){
        return ! line.match( /^\-/ );
      }).map(function(line){
        var cols = (" |" + line + " | ").split(" | ");
        cols.shift();
        cols.pop();
        return cols;
      });
      break;
    default:
      this.rows = _(lines).map(function(line){
        return line.split(",");
      });
    }
  },

  hasHeaderCols: function(){
    return this.get("headerCols").length > 0;
  },

  toJson: function(){
    return JSON.stringify({
      header: this.get("headerCols"),
      rows: this.rows
    });
  },

  toTsv: function(){
    var tsv = "";
    if(this.hasHeaderCols()){
      tsv += this.get("headerCols").map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }
    tsv += _(this.rows).map(function(cols){
      return cols.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }).join("");
    return tsv;
  },

  toHtmlTable: function(){
    var h = "";

    if(this.hasHeaderCols()){
      h += '<tr>' + this.get("headerCols").map(function(col){
        return '<th>'+col+'</th>';
      }) + '</tr>';
    }

    _(this.rows).each(function(cols){
      h += '<tr>';
      _(cols).each(function(col){
        h += '<td>' + escapeHtml(col) + '</td>';
      });
      h += '</tr>';
    });
    return h;
  },

  toGfmTable: function(){
    var numCols = 0;
    _(this.rows).each(function(cols){
      numCols = Math.max(numCols, cols.length);
    });

    var headCols;
    if(this.hasHeaderCols()){
      headCols = this.get("headerCols");
    }else{
      headCols = _.range(0, numCols).map(function(ci){
        return ci + 1;
      });
    }
    var s = "| " + headCols.join(" | ") + " |\n";

    var headLineCols = _.range(0, numCols).map(function(){
      return "---";
    });
    s += "| " + headLineCols.join(" | ") + " |\n";

    s += _(this.rows).map(function(cols){
      return "| " + cols.join(" | ") + " |\n";
    }).join("");

    return s;
  }
});

var AppV = Backbone.View.extend({
  initialize: function(){
    this.listenTo(this.model, "change", this.render);
    this.oninput_input();
  },

  events: {
    "input .input": "oninput_input",
    "change [name=input_type]": "onchange_inputType",
    "input .header_cols": "oninput_headerCols"
  },

  render: function(){
    this.model.parse();
    this.$(".output_json").val(this.model.toJson());
    this.$(".output_tsv").val(this.model.toTsv());
    this.$(".output_gfm_table").html(this.model.toGfmTable());
    this.$(".html_table").html(this.model.toHtmlTable());
    return this;
  },

  oninput_input: function(){
    this.model.set("input", this.$(".input").val());
  },

  onchange_inputType: function(){
    this.model.set("inputType", this.$("[name=input_type]:checked").val());
  },

  oninput_headerCols: function(){
    this.model.set("headerCols", this.$(".header_cols").val().split(","));
  }
});

$(function(){
  var appM = new AppM();
  var appV = new AppV({
    model: appM,
    el: $("body")[0]
  });
});
