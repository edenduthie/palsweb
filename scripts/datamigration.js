var baseDir = '/vagrant/data/pals/webappdata'
var palsDataDir = '/pals/data'

var fs = require('fs-extra');
var uuid = require('node-uuid')

var postgres = function () {

    that = {};
    
    that.pg = require('pg');
    that.connectionString = "pg://postgres:password@localhost:5432/pals"

    function sql(query,callback) {
        that.client.query(query,null,function(err,result){
            if( err ) console.log(err);
            else callback(result,that.client);
        });
    }
    that.sql = sql;
    
    function connect(callback) {
        console.log('connecting to postgres');
        that.pg.connect(that.connectionString,function(err,client){
            that.client = client;
            console.log('connected to postgres');
            if(err) console.log(err);
            callback(err);
        });
    }
    that.connect = connect;
    
    function end() {
        if( that.pg ) {
            that.pg.end();
        }
    }
    that.end = end;

    return that;
}

var mongo = function() {

    var that = {};
    that.mongo = require('mongodb');
    that.host = 'localhost';
    that.port = 81;
    that.db = new that.mongo.Db('meteor',new that.mongo.Server(that.host,that.port,[]),{fsync:true,journal : true});
    
    function connect(callback) {
        console.log('connecting to mongo');
        that.db.open(function(err,db){
            console.log('connected to mongo');
            if( err ) console.log(err);
            callback(err); 
        });
    };
    that.connect = connect;

    function find(table,query,callback) {
       that.db.collection(table,function(err,collection){
          if(err) console.log(err);
          else {
              collection.find(query,function(err,docs){
                 if(err) console.log(err);
                 else {
                     callback(docs,that.db);
                 }
              });
          }
       });
    };
    that.find = find;
    
    function findOne(table,query,callback) {
       that.db.collection(table,function(err,collection){
          if(err) console.log(err);
          else {
              collection.findOne(query,function(err,doc){
                 if(err) console.log(err);
                 else {
                     callback(err,doc);
                 }
              });
          }
       });
    };
    that.findOne = findOne;
    
    function insert(table,doc,callback) {
       that.db.collection(table,function(err,collection){
          if(err) console.log(err);
          else {
              collection.insert(doc,{w:1},function(err,result){
                 callback(err);
              });
          }
       });
    };
    that.insert = insert;

    return that;
};

function copyFile(source, target, cb) {
    fs.copySync(source,target,cb);
    cb();
}

function loadUsers(mongoI,callback) {
    console.log('Loading Users');
    
    mongoI.find('users',{},function(docs,db){
        var users = {};
        docs.nextObject(function(err, doc){
            processUser(docs,err,doc,callback,users,db); 
        });
    })
}

function processUser(docs,err,doc,callback,users,db) {
    if( err ) {
        console.log(err);
        callback(users);
    }
    else if( !doc ) {
        callback(users);
    }
    else if( doc.username ) {
        users[doc.username] = doc;
    }
    if( doc ) {
        docs.nextObject(function(err,doc){
            processUser(docs,err,doc,callback,users,db);
        })
    }
}

function processDataSets(users,mongoInstance,workspaces,pgInstance,publicWorkspace) {
    
    console.log("Processing data sets");
    
    var loadDataSetsQuery =

    "SELECT \
    ds.comments AS ds_comments,\
    ds.datasettype AS ds_datasettype,\
    ds.downloadcount AS ds_downloadcount,\
    ds.elevation AS ds_elevation,\
    ds.latitude AS ds_latitude,\
    ds.longitude AS ds_longitude,\
    ds.maxvegheight AS ds_maxvegheight,\
    ds.measurementaggregation AS ds_measurementaggregation,\
    ds.refs AS ds_refs,\
    ds.timezoneoffsethours AS ds_timezoneoffsethours,\
    ds.towerheight AS ds_towerheight,\
    ds.url AS ds_url,\
    ds.username AS ds_username,\
    ds.id AS ds_id,\
    c.name AS country_name,\
    ds.vegtype_vegetationtype AS ds_vegtype,\
    ds.soiltype AS ds_soiltype,\
    ds.sitecontact AS ds_sitecontact,\
    dsv.id as dsv_id, \
    dsv.description AS dsv_description,\
    dsv.ispublic AS dsv_ispublic,\
    dsv.originalfilename AS dsv_originalfilename,\
    dsv.uploaddate AS dsv_uploaddate,\
    dsv.startdate AS dsv_startdate,\
    dsv.enddate AS dsv_enddate,\
    a.name AS a_name,\
    a.status AS a_status,\
    a.owner_username AS a_owner, \
    e.experiment_id AS e_id \
    FROM dataset as ds, datasetversion as dsv, analysable as a, country as c, experimentable as e \
    WHERE dsv.id = ds.latestversion_id AND a.id = ds.id AND c.id = ds.country_id AND e.id = ds.id;";

    pgInstance.sql(loadDataSetsQuery,function(result,client){
        result.rows.forEach(function(row){
            //console.log(row);
            var filename = baseDir + '/' + row.ds_username + '/' + 'ds' + row.ds_id + '.' + row.dsv_id + '_flux.nc';
            fs.exists(filename, function (exists) {
                if( exists ) {
                    //console.log('File exsits: ' + filename);
                    // copy the file
                    var newFilename = uuid.v4();
                    fs.stat(filename,function(err,stats){
                        if( err ) {
                            console.log('could not stat ' + filename)
                        }
                        else {
                            var fileData = {
                                path : palsDataDir + '/' + newFilename,
                                filename : row.dsv_originalfilename,
                                size : stats['size'],
                                key : newFilename,
                                created : row.dsv_uploaddate
                            }
                            //console.log(fileData);
                            user = users[row.ds_username];
                            if( user ) {
                                copyDataSet(filename,fileData,row,user,mongoInstance,workspaces,publicWorkspace);
                            }
                            else console.log('Could not locate username ' + row.ds_username);
                        }
                    });
                }
            });
        })
        client.end();
    });
}

function processModelOutputs(users,mongoInstance,workspaces,pgInstance,publicWorkspace) {

    console.log("Processing model outputs");

    var loadModelOutputsQuery =

    "SELECT \
    mo.accesslevel as mo_accesslevel, \
    mo.modelid as mo_modelid, \
    mo.parameterselection as mo_parameterselection, \
    mo.stateselection as mo_stateselection, \
    mo.uploaddate as mo_uploaddate, \
    mo.username as mo_username, \
    mo.id as mo_id, \
    mo.usercomments as mo_usercomments, \
    dsv.id as dsv_id, \
    e.experiment_id AS e_id, \
    a.name AS a_name,\
    a.status AS a_status,\
    a.owner_username AS a_owner, \
    ds.id as ds_id \
    FROM modeloutput as mo \
    INNER JOIN datasetversion as dsv \
    ON dsv.id = mo.datasetversionid \
    INNER JOIN dataset as ds \
    ON ds.id = dsv.datasetid \
    INNER JOIN analysable as a \
    ON a.id = mo.id \
    INNER JOIN experimentable as e \
    ON e.id = mo.id;";

    pgInstance.sql(loadModelOutputsQuery,function(result,client){
        result.rows.forEach(function(row){
            var filename = baseDir + '/' + row.mo_username + '/' + 'mo' + row.mo_id + '.nc';
            fs.exists(filename, function (exists) {
                if( exists ) {
                    console.log('File exsits: ' + filename);
                    // copy the file
                    var newFilename = uuid.v4();
                    fs.stat(filename,function(err,stats){
                        if( err ) {
                            console.log('could not stat ' + filename)
                        }
                        else {
                            var fileData = {
                                path : palsDataDir + '/' + newFilename,
                                filename : 'mo' + row.mo_id + '.nc',
                                size : stats['size'],
                                key : newFilename,
                                created : row.mo_uploaddate
                            }
                            console.log(fileData);
                            user = users[row.mo_username];
                            if( user ) {
                                copyModelOutput(filename,fileData,row,user,mongoInstance,workspaces,publicWorkspace);
                            }
                            else console.log('Could not locate username ' + row.ds_username);
                        }
                    });
                }
            });
        })
        client.end();
    });
}

numberOfCopies = 0;
maxCopies = 100;

function copyModelOutput(filename,fileData,row,user,mongoInstance,workspaces,publicWorkspace) {
    console.log('Copying model output: ' + row.a_name);
    copyFile(filename,fileData.path,function(err){
        if( err ) console.log(err);
        else {
            var modelOutput = {
                _id : uuid.v4(),
                comments : row.mo_usercomments,
                created : row.mo_uploaddate,
                model : row.mo_modelid.toString(),
                name : row.a_name,
                owner : user._id,
                parameterSelection : row.mo_parameterselection,
                stateSelection : row.mo_stateselection,
                accessLevel : row.mo_accesslevel,
                status : row.a_status,
                versions : [fileData],
                experiment : row.ds_id.toString()
            }
            if( row.e_id ) {
                modelOutput.workspaces = [row.e_id.toString()];
            }
            else {
                modelOutput.workspaces = [publicWorkspace._id.toString()];
            }
            console.log(modelOutput);
            mongoInstance.insert('modelOutputs',modelOutput,function(err){
                if(err) {
                    console.log(err);
                    console.log('Trying with different name');
                    modelOutput.name = modelOutput.name + '.1';
                    mongoInstance.insert('modelOutputs',modelOutput,function(err){
                        if( err ) console.log(err);
                    });
                }
            });

        }
    });
}

function copyDataSet(filename,fileData,row,user,mongoInstance,workspaces,publicWorkspace) {
    console.log('Copying data set: ' + row.a_name);
    copyFile(filename,fileData.path,function(err){
        if( err ) console.log(err);
        else {
            var dataSet = {
                _id : row.ds_id.toString(),
                created : row.dsv_uploaddate,
                name : row.a_name,
                spatialLevel : 'SingleSite',
                owner : user._id,
                comments : row.ds_comments,
                country : row.country_name,
                elevation : row.ds_elevation,
                lat : row.ds_latitude,
                lon : row.ds_longitude,
                maxVegHeight : row.ds_maxvegheight,
                "public" : true,
                references : row.ds_refs,
                siteContact : row.ds_sitecontact,
                soilType : row.ds_soiltype,
                url : row.ds_url,
                vegType : row.ds_vegtype,
                type : row.ds_datasettype,
                measurementAggregation : row.ds_measurementaggregation,
                utcOffset : row.ds_timezoneoffsethours,
                towerHeight : row.ds_towerheight,
                versionDescription : row.dsv_description,
                startdate : row.dsv_startdate,
                enddate : row.dsv_enddate,
                versions : [fileData]
            }
            if( row.e_id ) {
                dataSet.workspaces = [row.e_id.toString()];
            }
            else {
                dataSet.workspaces = [publicWorkspace._id.toString()];
            }
            mongoInstance.insert('dataSets',dataSet,function(err){
                if(err) {
                    console.log(err);
                    console.log('Trying with different name');
                    dataSet.name = dataSet.name + '.1';
                    mongoInstance.insert('dataSets',dataSet,function(err){
                        if( err ) console.log(err);
                        else insertDefaultExperiment(dataSet,mongoInstance,publicWorkspace);
                    });
                }
                else insertDefaultExperiment(dataSet,mongoInstance,publicWorkspace);
            });
        
        }
    });
}

function insertDefaultExperiment(dataSet,mongoInstance,publicWorkspace) {
    var experiment = {
        _id : dataSet._id.toString(),
        name : dataSet.name,
        created : dataSet.created,
        spatialLevel : 'SingleSite',
        scripts : [{
            path : '/pals/data/SingleSiteExperiment.R',
            filename : 'SingleSiteExperiment.R',
            key : 'SingleSiteExperimnet.R',
        }],
        dataSets : [dataSet._id],
        owner : dataSet.owner,
        country : dataSet.country,
        vegType : dataSet.vegType,
        shortDescription : dataSet.comments,
        longDescription : dataSet.references
    }
    if( dataSet.workspaces && dataSet.workspaces.length > 0 && dataSet.workspaces[0] == publicWorkspace._id) {
        experiment.workspaces = dataSet.workspaces;
        mongoInstance.insert('experiments',experiment,function(err){
            if(err) console.log(err);
        });
    }

}

function loadWorkspaces(pgInstance,callback) {
    
    var loadWorkspacesQuery = "SELECT id, name, owner_username from experiment";
    
    pgInstance.sql(loadWorkspacesQuery,function(result,client){
        var workspaces = [];
        result.rows.forEach(function(row){
            workspaces.push(row);
        });
        callback(workspaces);
    });
}

function loadModels(pgInstance,callback) {
    var loadModelsQuery = "SELECT * FROM model";
    
    pgInstance.sql(loadModelsQuery,function(result,client){
        var models = [];
        result.rows.forEach(function(row){
            models.push(row);
        });
        callback(models);
    });
    
}

function loadSharedList(pgInstance,workspace,callback) {
    var loadSharedListQuery = "SELECT sharedlist_username FROM experiment_palsuser WHERE experiments_id = " + workspace.id;
    
    pgInstance.sql(loadSharedListQuery,function(result,client){
        workspace.users = [];
        result.rows.forEach(function(row){
            workspace.users.push(row);
        });
        callback();
    });
}

function loadAndCopyWorkspaces(pgInstance,mongoInstance,users,callback) {
    loadWorkspaces(pgInstance,function(workspaces){
        var waiting = workspaces.length;
        console.log("Loading shared lists");
        for( var i=0; i < workspaces.length; ++i ) {
            loadSharedList(pgInstance,workspaces[i],function(){
                --waiting;
                if( waiting <= 0 ) {
                    var mongoWorkspaces = mapWorkspaces(pgInstance,workspaces,users);
                    var waiting2 = mongoWorkspaces.length;
                    for( var j=0; j < waiting2; ++j ) {
                        saveWorkspace(mongoInstance,mongoWorkspaces[j],function(){
                            --waiting2;
                            if( waiting2 <=0 ) {
                                callback(mongoWorkspaces);
                            }
                        });
                    }
                }
            })
        }
    });
}

function saveWorkspace(mongoInstance,mongoWorkspace,callback) {
    mongoInstance.findOne('workspaces',{_id:mongoWorkspace._id},function(err,doc){
        if( err ) console.log(err);
        if( doc ) {
            console.log('Already have workspace with id ' + mongoWorkspace._id);
            callback();
        }
        else {
            mongoInstance.findOne('workspaces',{name:mongoWorkspace.name},function(err,doc2){
                if( err ) console.log(err);
                if( doc2 ) {
                    console.log('Already have workspace with name ' + mongoWorkspace.name + ' trying new name');
                    mongoWorkspace.name = mongoWorkspace.name + '(new)';
                }
                mongoInstance.insert('workspaces',mongoWorkspace,function(err){
                    if( err ) console.log(err);
                    callback();
                });
            });
        }
    });

}

function mapWorkspaces(pgInstance,workspaces,users) {
    var mongoWorkspaces = [];
    for( var i=0; i < workspaces.length; ++i ) {
        workspace = workspaces[i];
        var user = users[workspace.owner_username];
        if( !user ) {
            console.log('Could not find user: ' + workspace.owner_username);
        }
        else {
            var guests = [];
            for( var j=0; j < workspace.users.length; ++j ) {
                var guest = users[workspace.users[j].sharedlist_username];
                if( guest ) guests.push(guest._id);
            }
            
            var newWorkspace = {
                _id : workspace.id.toString(),
                name : workspace.name,
                owner : user._id,
                guests : guests
            }
            mongoWorkspaces.push(newWorkspace);
        }
    }
    return mongoWorkspaces;
}

function loadPublicWorkspace(mongoInstance,callback) {
    mongoInstance.findOne('workspaces',{name:'public'},function(err,result){
       callback(err,result); 
    });
}

function loadAndCopyModels(pgInstance,mongoInstance,users,publicWorkspace,callback) {
    console.log('Loading and copying models');
    loadModels(pgInstance,function(models){
        var mongoModels = [];
        for( var i=0; i < models.length; ++i ) {
            model = models[i];
            var user = users[model.ownerusername];
            if( !user ) {
                console.log('Could not find user: ' + model.owner_username);
            }
            else {
                var mongoModel = {
                    _id : model.id.toString(),
                    name : model.modelname,
                    owner : user._id,
                    workspaces : [publicWorkspace._id]
                }
                mongoModels.push(mongoModel);
            }
        }
        processMongoModels(mongoInstance,mongoModels,callback)
    });
}

function processMongoModels(mongoInstance,mongoModels,callback) {
    remaining = [];
    waiting = mongoModels.length;
    for( var i=0; i < mongoModels.length; ++i ) {
        saveModel(mongoInstance,mongoModels[i],function(model){
            if(model) {
                remaining.push(model);
            }
            --waiting;
            if( waiting <=0 ) {
                if(remaining.len > 0 ) {
                    processMongoModels(mongoInstance,remaining,callback);
                }
                else {
                    callback(mongoModels);
                }
            }
        });
    }
}

function saveModel(mongoInstance,model,callback) {
    mongoInstance.findOne('models',{_id:model._id},function(err,doc){
        if( err ) console.log(err);
        if( doc ) {
            console.log('Already have model with id ' + model._id);
            callback();
        }
        else {
            findAndSaveModelUniqueName(mongoInstance,model,callback)
        }
    });
}

function findAndSaveModelUniqueName(mongoInstance,model,callback) {
    mongoInstance.findOne('models',{name:model.name},function(err,doc2){
        if( err ) console.log(err);
        if( doc2 ) {
            console.log('Already have model with name ' + model.name + ' trying new name');
            model.name = model.name + '.1';
            callback(model);
        }
        else {
            console.log('Model name: ' + model.name);
            mongoInstance.insert('models',model,function(err){
                if( err ) console.log(err);
                callback();
            });
        }
    });
}

// var mongoInstance = mongo();
// mongoInstance.find('users',{},function(docs,db){
//     docs.each(function(err,doc){
//        console.log(JSON.stringify(doc));
//     });
// })

function process() {
    
    var mongoInstance = mongo();
    var pgInstance = postgres();
    
    mongoInstance.connect(function(err){
        if( !err ) {
            loadUsers(mongoInstance,function(users) {
                pgInstance.connect(function(err){
                    if( !err ) {
                        loadAndCopyWorkspaces(pgInstance,mongoInstance,users,function(workspaces){
                            console.log('loading public workspace');
                            loadPublicWorkspace(mongoInstance,function(err,result){
                                if( err ) console.log(err);
                                else {
                                    //processDataSets(users,mongoInstance,workspaces,pgInstance,result);
                                    loadAndCopyModels(pgInstance,mongoInstance,users,result,function(models){
                                        console.log('Models copied')
                                        processModelOutputs(users,mongoInstance,workspaces,pgInstance,result);
                                    });
                                }
                            });
                        });
                    }
                });
            });
        }
    });
}

process();
