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
    rows: []
  },

  parse: function(){
    var text = this.get("input");
    var lines = text.split("\n");
    this.rows = _(lines).map(function(line){
      return line.split(",");
    });
  },

  toJson: function(){
    return JSON.stringify(this.rows);
  },

  toTsv: function(){
    return _(this.rows).map(function(cols){
      return cols.map(function(col){
        return JSON.stringify(col); // quote by double quote
      }).join("\t") + "\n";
    }).join("");
  },

  toHtmlTable: function(){
    var h = "";
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

    var headCols = _.range(0, numCols).map(function(ci){
      return ci + 1;
    });
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
    "input .input": "oninput_input"
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
  }
});

$(function(){
  var appM = new AppM();
  var appV = new AppV({
    model: appM,
    el: $("body")[0]
  });
});
