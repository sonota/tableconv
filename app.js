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
