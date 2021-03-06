Template.workspace.created = function() {
    var user = Meteor.user();
    if( user ) {
        this.id = Session.get('currentWorkspace');
        var query = {'_id':this.id,'owner':user._id};
        this.workspace = Template.workspace.workspace();
        Meteor.users.update({'_id':user._id}, 
            {'$set' : {'profile.currentWorkspace':this.workspace}});
    }
};

Template.workspace.isOwner = function() {
    var user = Meteor.user();
    var workspace = Template.workspace.workspace();
    if( workspace && user && workspace.owner == user._id ) return true;
    else return false;
}

Template.workspace.workspace = function() {
    var user = Meteor.user();
    if( user ) {
        var id = Session.get('currentWorkspace');
        var workspace =  Workspaces.findOne({'_id':id});
        return workspace;
    }
};

Template.workspace.users = function() {
    var users = Meteor.users.find().fetch();
    var workspace = Template.workspace.workspace();
    if( workspace ) {
        users.forEach(function(user){
            if( workspace.guests && workspace.guests.lastIndexOf(user._id) >= 0 ) {
                user.invited = true;
            }
            if( user.emails && user.emails.length > 0 ) {
                user.email = user.emails[0].address;
            }
            if( !user.email ) user.email = user.username;
        });
    }
    return users;
};

Template.workspace.events({
    'click .invite-user': function (event) {
        var user = Meteor.user();
        var id = $(event.target).attr('id');
        var checked = $(event.target).is(":checked");
        if( id && checked ) {
            var workspaceId = Session.get('currentWorkspace');
            selector = { '_id' : workspaceId };
            var update = { '$addToSet' :  { 'guests' : id } };
            Workspaces.update(selector,update,function(error){
                if( error ) alert(error);
            });
        }
        else if( id && !checked ) {
            var workspaceId = Session.get('currentWorkspace');
            var selector = { '_id' : workspaceId };
            var update = { '$pull' :  { 'guests' : id } };
            Workspaces.update(selector,update,function(error){
                if( error ) alert(error);
            });
        }
    }
});

Template.workspace.helpers({
  checkedIfTrue: function (isTrue) {
      if( isTrue ) return 'checked';
  }
});