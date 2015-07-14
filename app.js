function puts(){
  console.log.apply(console, arguments);
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
      return cols.join("\t") + "\n";
    }).join("");
  },

  toHtmlTable: function(){
    var h = "";
    _(this.rows).each(function(cols){
      h += '<tr>';
      _(cols).each(function(col){
        h += '<td>' + col + '</td>';
      });
      h += '</tr>';
    });
    return h;
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
