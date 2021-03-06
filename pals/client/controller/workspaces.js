Template.workspaces.myWorkspaces = function() {
    var user = Meteor.user();
    if( user ) {
        var workspaces =  Workspaces.find({'owner':user._id});
        return workspaces;
    }
};

Template.workspaces.sharedWorkspaces = function() {
    var user = Meteor.user();
    if( user ) {
        var workspaces =  Workspaces.find({'guests':user._id});
        return workspaces;
    }
};

Template.workspaces.rootWorkspace = function() {
    return Workspaces.findOne({'name':'public'});
};

Template.workspaces.events({
  'click #add-workspace': function (event) {
      event.preventDefault();
      var user = Meteor.user();
      var name = $('input[name="workspace.name"]').val();
      if( name && name.length > 0 ) {
          Workspaces.insert({"owner":user._id,"name":name},function(error,id){
              if( error ) alert(error);
              else {
                  var workspace = Workspaces.findOne({'_id':id});
                  user.profile.currentWorkspace = workspace;
                  Meteor.users.update({'_id':user._id}, 
                      {'$set' : {'profile.currentWorkspace':user.profile.currentWorkspace}});
              }
          });
      }
  },
  'click .open-workspace':function (event) {
      var id = $(event.target).attr('id');
      if( id ) {
          Router.go('/workspaces/'+id);
      }
  },
  'click .delete-workspace':function (event) {
      var id = $(event.target).attr('id');
      var user = Meteor.user();
      if( id ) {
          Workspaces.remove({'_id':id},function(error){
              if( error ) alert(error);
          });
      }
  },
  'click .open-workspace-shared':function (event) {
      var id = $(event.target).attr('id');
      if( id ) {
          var user = Meteor.user();
          var workspace = Workspaces.findOne({'_id':id,'guests':user._id});
          Meteor.users.update({'_id':user._id}, 
            {'$set' : {'profile.currentWorkspace':workspace}});
      }
  },
});

