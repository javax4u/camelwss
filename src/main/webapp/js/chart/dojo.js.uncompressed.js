/*
	Copyright (c) 2004-2011, The Dojo Foundation All Rights Reserved.
	Available via Academic Free License >= 2.1 OR the modified BSD license.
	see: http://dojotoolkit.org/license for details
*/

/*
	This is an optimized version of Dojo, built for deployment and not for
	development. To get sources and documentation, please visit:

		http://dojotoolkit.org
*/

(function(
	userConfig,
	defaultConfig
){
	// summary:
	//		This is the "source loader" and is the entry point for Dojo during development. You may also load Dojo with
	//		any AMD-compliant loader via the package main module dojo/main.
	// description:
	//		This is the "source loader" for Dojo. It provides an AMD-compliant loader that can be configured
	//		to operate in either synchronous or asynchronous modes. After the loader is defined, dojo is loaded
	//		IAW the package main module dojo/main. In the event you wish to use a foreign loader, you may load dojo as a package
	//		via the package main module dojo/main and this loader is not required; see dojo/package.json for details.
	//
	//		In order to keep compatibility with the v1.x line, this loader includes additional machinery that enables
	//		the dojo.provide, dojo.require et al API. This machinery is loaded by default, but may be dynamically removed
	//		via the has.js API and statically removed via the build system.
	//
	//		This loader includes sniffing machinery to determine the environment; the following environments are supported:
	//
	//			* browser
	//			* node.js
	//			* rhino
	//
	//		This is the so-called "source loader". As such, it includes many optional features that may be discadred by
	//		building a customized verion with the build system.

	// Design and Implementation Notes
	//
	// This is a dojo-specific adaption of bdLoad, donated to the dojo foundation by Altoviso LLC.
	//
	// This function defines an AMD-compliant (http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition)
	// loader that can be configured to operate in either synchronous or asynchronous modes.
	//
	// Since this machinery implements a loader, it does not have the luxury of using a load system and/or
	// leveraging a utility library. This results in an unpleasantly long file; here is a road map of the contents:
	//
	//	 1. Small library for use implementing the loader.
	//	 2. Define the has.js API; this is used throughout the loader to bracket features.
	//	 3. Define the node.js and rhino sniffs and sniff.
	//	 4. Define the loader's data.
	//	 5. Define the configuration machinery.
	//	 6. Define the script element sniffing machinery and sniff for configuration data.
	//	 7. Configure the loader IAW the provided user, default, and sniffing data.
	//	 8. Define the global require function.
	//	 9. Define the module resolution machinery.
	//	10. Define the module and plugin module definition machinery
	//	11. Define the script injection machinery.
	//	12. Define the window load detection.
	//	13. Define the logging API.
	//	14. Define the tracing API.
	//	16. Define the AMD define function.
	//	17. Define the dojo v1.x provide/require machinery--so called "legacy" modes.
	//	18. Publish global variables.
	//
	// Language and Acronyms and Idioms
	//
	// moduleId: a CJS module identifier, (used for public APIs)
	// mid: moduleId (used internally)
	// packageId: a package identifier (used for public APIs)
	// pid: packageId (used internally); the implied system or default package has pid===""
	// pack: package is used internally to reference a package object (since javascript has reserved words including "package")
	// prid: plugin resource identifier
	// The integer constant 1 is used in place of true and 0 in place of false.

	// define a minimal library to help build the loader
	var	noop = function(){
		},

		isEmpty = function(it){
			for(var p in it){
				return 0;
			}
			return 1;
		},

		toString = {}.toString,

		isFunction = function(it){
			return toString.call(it) == "[object Function]";
		},

		isString = function(it){
			return toString.call(it) == "[object String]";
		},

		isArray = function(it){
			return toString.call(it) == "[object Array]";
		},

		forEach = function(vector, callback){
			if(vector){
				for(var i = 0; i < vector.length;){
					callback(vector[i++]);
				}
			}
		},

		mix = function(dest, src){
			for(var p in src){
				dest[p] = src[p];
			}
			return dest;
		},

		makeError = function(error, info){
			return mix(new Error(error), {src:"dojoLoader", info:info});
		},

		uidSeed = 1,

		uid = function(){
			// Returns a unique indentifier (within the lifetime of the document) of the form /_d+/.
			return "_" + uidSeed++;
		},

		// FIXME: how to doc window.require() api

		// this will be the global require function; define it immediately so we can start hanging things off of it
		req = function(
			config,       //(object, optional) hash of configuration properties
			dependencies, //(array of commonjs.moduleId, optional) list of modules to be loaded before applying callback
			callback      //(function, optional) lamda expression to apply to module values implied by dependencies
		){
			return contextRequire(config, dependencies, callback, 0, req);
		},

		// the loader uses the has.js API to control feature inclusion/exclusion; define then use throughout
		global = this,

		doc = global.document,

		element = doc && doc.createElement("DiV"),

		has = req.has = function(name){
			return isFunction(hasCache[name]) ? (hasCache[name] = hasCache[name](global, doc, element)) : hasCache[name];
		},

		hasCache = has.cache = defaultConfig.hasCache;

	has.add = function(name, test, now, force){
		(hasCache[name]===undefined || force) && (hasCache[name] = test);
		return now && has(name);
	};

	false && has.add("host-node", userConfig.has && "host-node" in userConfig.has ?
		userConfig.has["host-node"] :
		(typeof process == "object" && process.versions && process.versions.node && process.versions.v8));
	if(0){
		// fixup the default config for node.js environment
		require("./_base/configNode.js").config(defaultConfig);
		// remember node's require (with respect to baseUrl==dojo's root)
		defaultConfig.loaderPatch.nodeRequire = require;
	}

	false && has.add("host-rhino", userConfig.has && "host-rhino" in userConfig.has ?
		userConfig.has["host-rhino"] :
		(typeof load == "function" && (typeof Packages == "function" || typeof Packages == "object")));
	if(0){
		// owing to rhino's lame feature that hides the source of the script, give the user a way to specify the baseUrl...
		for(var baseUrl = userConfig.baseUrl || ".", arg, rhinoArgs = this.arguments, i = 0; i < rhinoArgs.length;){
			arg = (rhinoArgs[i++] + "").split("=");
			if(arg[0] == "baseUrl"){
				baseUrl = arg[1];
				break;
			}
		}
		load(baseUrl + "/_base/configRhino.js");
		rhinoDojoConfig(defaultConfig, baseUrl, rhinoArgs);
	}

	// userConfig has tests override defaultConfig has tests; do this after the environment detection because
	// the environment detection usually sets some has feature values in the hasCache.
	for(var p in userConfig.has){
		has.add(p, userConfig.has[p], 0, 1);
	}

	//
	// define the loader data
	//

	// the loader will use these like symbols if the loader has the traceApi; otherwise
	// define magic numbers so that modules can be provided as part of defaultConfig
	var	requested = 1,
		arrived = 2,
		nonmodule = 3,
		executing = 4,
		executed = 5;

	if(0){
		// these make debugging nice; but using strings for symbols is a gross rookie error; don't do it for production code
		requested = "requested";
		arrived = "arrived";
		nonmodule = "not-a-module";
		executing = "executing";
		executed = "executed";
	}

	var legacyMode = 0,
		sync = "sync",
		xd = "xd",
		syncExecStack = [],
		dojoRequirePlugin = 0,
		checkDojoRequirePlugin = noop,
		transformToAmd = noop,
		getXhr;
	if(0){
		req.isXdUrl = noop;

		req.initSyncLoader = function(dojoRequirePlugin_, checkDojoRequirePlugin_, transformToAmd_){
			if(!dojoRequirePlugin){
				dojoRequirePlugin = dojoRequirePlugin_;
				checkDojoRequirePlugin = checkDojoRequirePlugin_;
				transformToAmd = transformToAmd_;
			}
			return {
				sync:sync,
				xd:xd,
				arrived:arrived,
				nonmodule:nonmodule,
				executing:executing,
				executed:executed,
				syncExecStack:syncExecStack,
				modules:modules,
				execQ:execQ,
				getModule:getModule,
				injectModule:injectModule,
				setArrived:setArrived,
				signal:signal,
				finishExec:finishExec,
				execModule:execModule,
				dojoRequirePlugin:dojoRequirePlugin,
				getLegacyMode:function(){return legacyMode;},
				holdIdle:function(){checkCompleteGuard++;},
				releaseIdle:function(){checkIdle();}
			};
		};

		if(1){
			// in legacy sync mode, the loader needs a minimal XHR library to load dojo/_base/loader and dojo/_base/xhr

			var locationProtocol = location.protocol,
				locationHost = location.host,
				fileProtocol = !locationHost;
			req.isXdUrl = function(url){
				if(fileProtocol || /^\./.test(url)){
					// begins with a dot is always relative to page URL; therefore not xdomain
					return false;
				}
				if(/^\/\//.test(url)){
					// for v1.6- backcompat, url starting with // indicates xdomain
					return true;
				}
				// get protocol and host
				var match = url.match(/^([^\/\:]+\:)\/\/([^\/]+)/);
				return match && (match[1] != locationProtocol || match[2] != locationHost);
			};

			// note: to get the file:// protocol to work in FF, you must set security.fileuri.strict_origin_policy to false in about:config
			true || has.add("dojo-xhr-factory", 1);
			has.add("dojo-force-activex-xhr", 1 && !doc.addEventListener && window.location.protocol == "file:");
			has.add("native-xhr", typeof XMLHttpRequest != "undefined");
			if(has("native-xhr") && !has("dojo-force-activex-xhr")){
				getXhr = function(){
					return new XMLHttpRequest();
				};
			}else{
				// if in the browser an old IE; find an xhr
				for(var XMLHTTP_PROGIDS = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'], progid, i = 0; i < 3;){
					try{
						progid = XMLHTTP_PROGIDS[i++];
						if(new ActiveXObject(progid)){
							// this progid works; therefore, use it from now on
							break;
						}
					}catch(e){
						// squelch; we're just trying to find a good ActiveX progid
						// if they all fail, then progid ends up as the last attempt and that will signal the error
						// the first time the client actually tries to exec an xhr
					}
				}
				getXhr = function(){
					return new ActiveXObject(progid);
				};
			}
			req.getXhr = getXhr;

			has.add("dojo-gettext-api", 1);
			req.getText = function(url, async, onLoad){
				var xhr = getXhr();
				xhr.open('GET', fixupUrl(url), false);
				xhr.send(null);
				if(xhr.status == 200 || (!location.host && !xhr.status)){
					if(onLoad){
						onLoad(xhr.responseText, async);
					}
				}else{
					throw makeError("xhrFailed", xhr.status);
				}
				return xhr.responseText;
			};
		}
	}else{
		req.async = 1;
	}

	//
	// loader eval
	//
	var eval_ =
		// use the function constructor so our eval is scoped close to (but not in) in the global space with minimal pollution
		new Function('return eval(arguments[0]);');

	req.eval =
		function(text, hint){
			return eval_(text + "\r\n////@ sourceURL=" + hint);
		};

	//
	// loader micro events API
	//
	var listenerQueues = {},
		error = "error",
		signal = req.signal = function(type, args){
			var queue = listenerQueues[type];
			// notice we run a copy of the queue; this allows listeners to add/remove
			// other listeners without affecting this particular signal
			forEach(queue && queue.slice(0), function(listener){
				listener.apply(null, isArray(args) ? args : [args]);
			});
		},
		on = req.on = function(type, listener){
			// notice a queue is not created until a client actually connects
			var queue = listenerQueues[type] || (listenerQueues[type] = []);
			queue.push(listener);
			return {
				remove:function(){
					for(var i = 0; i<queue.length; i++){
						if(queue[i]===listener){
							queue.splice(i, 1);
							return;
						}
					}
				}
			};
		};

	// configuration machinery; with an optimized/built defaultConfig, all configuration machinery can be discarded
	// lexical variables hold key loader data structures to help with minification; these may be completely,
	// one-time initialized by defaultConfig for optimized/built versions
	var
		aliases
			// a vector of pairs of [regexs or string, replacement] => (alias, actual)
			= [],

		paths
			// CommonJS paths
			= {},

		pathsMapProg
			// list of (from-path, to-path, regex, length) derived from paths;
			// a "program" to apply paths; see computeMapProg
			= [],

		packs
			// a map from packageId to package configuration object; see fixupPackageInfo
			= {},

		packageMap
			// map from package name to local-installed package name
			= {},

		packageMapProg
			// list of (from-package, to-package, regex, length) derived from packageMap;
			// a "program" to apply paths; see computeMapProg
			= [],

		modules
			// A hash:(mid) --> (module-object) the module namespace
			//
			// pid: the package identifier to which the module belongs (e.g., "dojo"); "" indicates the system or default package
			// mid: the fully-resolved (i.e., mappings have been applied) module identifier without the package identifier (e.g., "dojo/io/script")
			// url: the URL from which the module was retrieved
			// pack: the package object of the package to which the module belongs
			// executed: 0 => not executed; executing => in the process of tranversing deps and running factory; executed => factory has been executed
			// deps: the dependency vector for this module (vector of modules objects)
			// def: the factory for this module
			// result: the result of the running the factory for this module
			// injected: (requested | arrived | nonmodule) the status of the module; nonmodule means the resource did not call define
			// load: plugin load function; applicable only for plugins
			//
			// Modules go through several phases in creation:
			//
			// 1. Requested: some other module's definition or a require application contained the requested module in
			//    its dependency vector or executing code explicitly demands a module via req.require.
			//
			// 2. Injected: a script element has been appended to the insert-point element demanding the resource implied by the URL
			//
			// 3. Loaded: the resource injected in [2] has been evalated.
			//
			// 4. Defined: the resource contained a define statement that advised the loader about the module. Notice that some
			//    resources may just contain a bundle of code and never formally define a module via define
			//
			// 5. Evaluated: the module was defined via define and the loader has evaluated the factory and computed a result.
			= {},

		cacheBust
			// query string to append to module URLs to bust browser cache
			= "",

		cache
			// hash:(mid)-->(function)
			//
			// Gives the contents of a cached resource; function should cause the same actions as if the given mid was downloaded
			// and evaluated by the host environment
			 = {},

		pendingCacheInsert
			// hash:(mid)-->(function)
			//
			// Gives a set of cache modules pending entry into cache. When cached modules are published to the loader, they are
			// entered into pendingCacheInsert; modules are then pressed into cache upon (1) AMD define or (2) upon receiving another
			// independent set of cached modules. (1) is the usual case, and this case allows normalizing mids given in the pending
			// cache for the local configuration, possibly relocating modules.
			 = {},

		dojoSniffConfig
			// map of configuration variables
			// give the data-dojo-config as sniffed from the document (if any)
			= {};

	if(1){
		var consumePendingCacheInsert = function(referenceModule){
				var p, item, match, now;
				for(p in pendingCacheInsert){
					item = pendingCacheInsert[p];
					match = p.match(/^url\:(.+)/);
					if(match){
						cache[toUrl(match[1], referenceModule)] =  item;
					}else if(p=="*now"){
						now = item;
					}else if(p!="*noref"){
						cache[getModuleInfo(p, referenceModule).mid] = item;
					}
				}
				if(now){
					now(createRequire(referenceModule));
				}
				pendingCacheInsert = {};
			},

			computeMapProg = function(map, dest, packName){
				// This routine takes a map target-prefix(string)-->replacement(string) into a vector
				// of quads (target-prefix, replacement, regex-for-target-prefix, length-of-target-prefix)
				//
				// The loader contains processes that map one string prefix to another. These
				// are encountered when applying the requirejs paths configuration and when mapping
				// package names. We can make the mapping and any replacement easier and faster by
				// replacing the map with a vector of quads and then using this structure in the simple machine runMapProg.
				dest.splice(0, dest.length);
				var p, i, item, reverseName = 0;
				for(p in map){
					dest.push([p, map[p]]);
					if(map[p]==packName){
						reverseName = p;
					}
				}
				dest.sort(function(lhs, rhs){
					return rhs[0].length - lhs[0].length;
				});
				for(i = 0; i < dest.length;){
					item = dest[i++];
					item[2] = new RegExp("^" + item[0].replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, function(c){ return "\\" + c; }) + "(\/|$)");
					item[3] = item[0].length + 1;
				}
				return reverseName;
			},

			fixupPackageInfo = function(packageInfo, baseUrl){
				// calculate the precise (name, baseUrl, main, mappings) for a package
				var name = packageInfo.name;
				if(!name){
					// packageInfo must be a string that gives the name
					name = packageInfo;
					packageInfo = {name:name};
				}
				packageInfo = mix({main:"main", mapProg:[]}, packageInfo);
				packageInfo.location = (baseUrl || "") + (packageInfo.location ? packageInfo.location : name);
				packageInfo.reverseName = computeMapProg(packageInfo.packageMap, packageInfo.mapProg, name);

				if(!packageInfo.main.indexOf("./")){
					packageInfo.main = packageInfo.main.substring(2);
				}

				// allow paths to be specified in the package info
				// TODO: this is not supported; remove
				mix(paths, packageInfo.paths);

				// now that we've got a fully-resolved package object, push it into the configuration
				packs[name] = packageInfo;
				packageMap[name] = name;
			},

			config = function(config, booting){
				for(var p in config){
					if(p=="waitSeconds"){
						req.waitms = (config[p] || 0) * 1000;
					}
					if(p=="cacheBust"){
						cacheBust = config[p] ? (isString(config[p]) ? config[p] : (new Date()).getTime() + "") : "";
					}
					if(p=="baseUrl" || p=="combo"){
						req[p] = config[p];
					}
					if(0 && p=="async"){
						// falsy or "sync" => legacy sync loader
						// "xd" => sync but loading xdomain tree and therefore loading asynchronously (not configurable, set automatically by the loader)
						// "legacyAsync" => permanently in "xd" by choice
						// "debugAtAllCosts" => trying to load everything via script injection (not implemented)
						// otherwise, must be truthy => AMD
						// legacyMode: sync | legacyAsync | xd | false
						var mode = config[p];
						req.legacyMode = legacyMode = (isString(mode) && /sync|legacyAsync/.test(mode) ? mode : (!mode ? "sync" : false));
						req.async = !legacyMode;
					}
					if(config[p]!==hasCache){
						// accumulate raw config info for client apps which can use this to pass their own config
						req.rawConfig[p] = config[p];
						p!="has" && has.add("config-"+p, config[p], 0, booting);
					}
				}

				// make sure baseUrl exists
				if(!req.baseUrl){
					req.baseUrl = "./";
				}
				// make sure baseUrl ends with a slash
				if(!/\/$/.test(req.baseUrl)){
					req.baseUrl += "/";
				}

				// now do the special work for has, packages, packagePaths, paths, aliases, and cache

				for(p in config.has){
					has.add(p, config.has[p], 0, booting);
				}

				// for each package found in any packages config item, augment the packs map owned by the loader
				forEach(config.packages, fixupPackageInfo);

				// for each packagePath found in any packagePaths config item, augment the packs map owned by the loader
				for(baseUrl in config.packagePaths){
					forEach(config.packagePaths[baseUrl], function(packageInfo){
						fixupPackageInfo(packageInfo, baseUrl + "/");
					});
				}

				// push in any paths and recompute the internal pathmap
				// warning: this cann't be done until the package config is processed since packages may include path info
				computeMapProg(mix(paths, config.paths), pathsMapProg);

				// aliases
				forEach(config.aliases, function(pair){
					if(isString(pair[0])){
						pair[0] = new RegExp("^" + pair[0].replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, function(c){return "\\" + c;}) + "$");
					}
					aliases.push(pair);
				});

				// mix any packageMap config item and recompute the internal packageMapProg
				computeMapProg(mix(packageMap, config.packageMap), packageMapProg);

				// push in any new cache values
				if(config.cache){
					consumePendingCacheInsert();
					pendingCacheInsert = config.cache;
					if(config.cache["*noref"]){
						consumePendingCacheInsert();
					}
				}

				signal("config", [config, req.rawConfig]);
			};

		//
		// execute the various sniffs
		//

		if(has("dojo-cdn") || 1){
			for(var dojoDir, src, match, scripts = doc.getElementsByTagName("script"), i = 0; i < scripts.length && !match; i++){
				if((src = scripts[i].getAttribute("src")) && (match = src.match(/(.*)\/?dojo\.js(\W|$)/i))){
					// if baseUrl wasn't explicitly set, set it here to the dojo directory; this is the 1.6- behavior
					userConfig.baseUrl = dojoDir = userConfig.baseUrl || defaultConfig.baseUrl || match[1];

					// see if there's a dojo configuration stuffed into the node
					src = (scripts[i].getAttribute("data-dojo-config") || scripts[i].getAttribute("djConfig"));
					if(src){
						dojoSniffConfig = req.eval("({ " + src + " })", "data-dojo-config");
					}
					if(0){
						var dataMain = scripts[i].getAttribute("data-main");
						if(dataMain){
							dojoSniffConfig.deps = dojoSniffConfig.deps || [dataMain];
						}
					}
				}
			}
		}

		if(0){
			// pass down doh.testConfig from parent as if it were a data-dojo-config
			try{
				if(window.parent != window && window.parent.require){
					var doh = window.parent.require("doh");
					doh && mix(dojoSniffConfig, doh.testConfig);
				}
			}catch(e){}
		}

		// configure the loader; let the user override defaults
		req.rawConfig = {};
		config(defaultConfig, 1);
		config(userConfig, 1);
		config(dojoSniffConfig, 1);

		if(has("dojo-cdn")){
			packs.dojo.location = dojoDir;
			packs.dijit.location = dojoDir + "../dijit/";
			packs.dojox.location = dojoDir + "../dojox/";
		}

	}else{
		// no config API, assume defaultConfig has everything the loader needs...for the entire lifetime of the application
		paths = defaultConfig.paths;
		pathsMapProg = defaultConfig.pathsMapProg;
		packs = defaultConfig.packs;
		aliases = defaultConfig.aliases;
		packageMap = defaultConfig.packageMap;
		packageMapProg = defaultConfig.packageMapProg;
		modules = defaultConfig.modules;
		cache = defaultConfig.cache;
		cacheBust = defaultConfig.cacheBust;

		// remember the default config for other processes (e.g., dojo/config)
		req.rawConfig = defaultConfig;
	}


	if(0){
		req.combo = req.combo || {add:noop};
		var	comboPending = 0,
			combosPending = [],
			comboPendingTimer = null;
	}


	// build the loader machinery iaw configuration, including has feature tests
	var	injectDependencies = function(module){
			// checkComplete!=0 holds the idle signal; we're not idle if we're injecting dependencies
			checkCompleteGuard++;
			forEach(module.deps, injectModule);
			if(0 && comboPending && !comboPendingTimer){
				comboPendingTimer = setTimeout(function() {
					comboPending = 0;
					comboPendingTimer = null;
					req.combo.done(function(mids, url) {
						var onLoadCallback= function(){
							// defQ is a vector of module definitions 1-to-1, onto mids
							runDefQ(0, mids);
							checkComplete();
						};
						combosPending.push(mids);
						injectingModule = mids;
						req.injectUrl(url, onLoadCallback, mids);
						injectingModule = 0;
					}, req);
				}, 0);
			}
			checkIdle();
		},

		contextRequire = function(a1, a2, a3, referenceModule, contextRequire){
			var module, syntheticMid;
			if(isString(a1)){
				// signature is (moduleId)
				module = getModule(a1, referenceModule, true);
				if(module && module.executed){
					return module.result;
				}
				throw makeError("undefinedModule", a1);
			}
			if(!isArray(a1)){
				// a1 is a configuration
				config(a1);

				// juggle args; (a2, a3) may be (dependencies, callback)
				a1 = a2;
				a2 = a3;
			}
			if(isArray(a1)){
				// signature is (requestList [,callback])
				if(!a1.length){
					a2 && a2();
				}else{
					syntheticMid = "require*" + uid();

					// resolve the request list with respect to the reference module
					for(var mid, deps = [], i = 0; i < a1.length;){
						mid = a1[i++];
						if(mid in {exports:1, module:1}){
							throw makeError("illegalModuleId", mid);
						}
						deps.push(getModule(mid, referenceModule));
					}

					// construct a synthetic module to control execution of the requestList, and, optionally, callback
					module = mix(makeModuleInfo("", syntheticMid, 0, ""), {
						injected: arrived,
						deps: deps,
						def: a2 || noop,
						require: referenceModule ? referenceModule.require : req
					});
					modules[module.mid] = module;

					// checkComplete!=0 holds the idle signal; we're not idle if we're injecting dependencies
					injectDependencies(module);

					// try to immediately execute
					// if already traversing a factory tree, then strict causes circular dependency to abort the execution; maybe
					// it's possible to execute this require later after the current traversal completes and avoid the circular dependency.
					// ...but *always* insist on immediate in synch mode
					var strict = checkCompleteGuard && req.async;
					checkCompleteGuard++;
					execModule(module, strict);
					checkIdle();
					if(!module.executed){
						// some deps weren't on board or circular dependency detected and strict; therefore, push into the execQ
						execQ.push(module);
					}
					checkComplete();
				}
			}
			return contextRequire;
		},

		createRequire = function(module){
			if(!module){
				return req;
			}
			var result = module.require;
			if(!result){
				result = function(a1, a2, a3){
					return contextRequire(a1, a2, a3, module, result);
				};
				module.require = mix(result, req);
				result.module = module;
				result.toUrl = function(name){
					return toUrl(name, module);
				};
				result.toAbsMid = function(mid){
					return toAbsMid(mid, module);
				};
				if(0){
					result.undef = function(mid){
						req.undef(mid, module);
					};
				}
				if(0){
					result.syncLoadNls = function(mid){
						var nlsModuleInfo = getModuleInfo(mid, module),
							nlsModule = modules[nlsModuleInfo.mid];
						if(!nlsModule || !nlsModule.executed){
							cached = cache[nlsModuleInfo.mid] || cache[nlsModuleInfo.cacheId];
							if(cached){
								evalModuleText(cached);
								nlsModule = modules[nlsModuleInfo.mid];
							}
						}
						return nlsModule && nlsModule.executed && nlsModule.result;
					};
				}

			}
			return result;
		},

		execQ =
			// The list of modules that need to be evaluated.
			[],

		defQ =
			// The queue of define arguments sent to loader.
			[],

		waiting =
			// The set of modules upon which the loader is waiting for definition to arrive
			{},

		setRequested = function(module){
			module.injected = requested;
			waiting[module.mid] = 1;
			if(module.url){
				waiting[module.url] = module.pack || 1;
			}
		},

		setArrived = function(module){
			module.injected = arrived;
			delete waiting[module.mid];
			if(module.url){
				delete waiting[module.url];
			}
			if(isEmpty(waiting)){
				clearTimer();
				0 && legacyMode==xd && (legacyMode = sync);
			}
		},

		execComplete = req.idle =
			// says the loader has completed (or not) its work
			function(){
				return !defQ.length && isEmpty(waiting) && !execQ.length && !checkCompleteGuard;
			},

		runMapProg = function(targetMid, map){
			// search for targetMid in map; return the map item if found; falsy otherwise
			for(var i = 0; i < map.length; i++){
				if(map[i][2].test(targetMid)){
					return map[i];
				}
			}
			return 0;
		},

		compactPath = function(path){
			var result = [],
				segment, lastSegment;
			path = path.replace(/\\/g, '/').split('/');
			while(path.length){
				segment = path.shift();
				if(segment==".." && result.length && lastSegment!=".."){
					result.pop();
					lastSegment = result[result.length - 1];
				}else if(segment!="."){
					result.push(lastSegment= segment);
				} // else ignore "."
			}
			return result.join("/");
		},

		makeModuleInfo = function(pid, mid, pack, url, cacheId){
			if(0){
				var xd= req.isXdUrl(url);
				return {pid:pid, mid:mid, pack:pack, url:url, executed:0, def:0, isXd:xd, isAmd:!!(xd || (packs[pid] && packs[pid].isAmd)), cacheId:cacheId};
			}else{
				return {pid:pid, mid:mid, pack:pack, url:url, executed:0, def:0, cacheId:cacheId};
			}
		},

		getModuleInfo_ = function(mid, referenceModule, packs, modules, baseUrl, packageMapProg, pathsMapProg, alwaysCreate){
			// arguments are passed instead of using lexical variables so that this function my be used independent of the loader (e.g., the builder)
			// alwaysCreate is useful in this case so that getModuleInfo never returns references to real modules owned by the loader
			var pid, pack, midInPackage, mapProg, mapItem, path, url, result, isRelative, requestedMid, cacheId=0;
			requestedMid = mid;
			isRelative = /^\./.test(mid);
			if(/(^\/)|(\:)|(\.js$)/.test(mid) || (isRelative && !referenceModule)){
				// absolute path or protocol of .js filetype, or relative path but no reference module and therefore relative to page
				// whatever it is, it's not a module but just a URL of some sort
				return makeModuleInfo(0, mid, 0, mid);
			}else{
				// relative module ids are relative to the referenceModule; get rid of any dots
				mid = compactPath(isRelative ? (referenceModule.mid + "/../" + mid) : mid);
				if(/^\./.test(mid)){
					throw makeError("irrationalPath", mid);
				}
				// find the package indicated by the mid, if any
				mapProg = referenceModule && referenceModule.pack && referenceModule.pack.mapProg;
				mapItem = (mapProg && runMapProg(mid, mapProg)) || runMapProg(mid, packageMapProg);
				if(mapItem){
					// mid specified a module that's a member of a package; figure out the package id and module id
					// notice we expect pack.main to be valid with no pre or post slash
					pid = mapItem[1];
					mid = mid.substring(mapItem[3]);
					pack = packs[pid];
					if(!mid){
						mid= pack.main;
					}
					midInPackage = mid;
					cacheId = pack.reverseName + "/" + mid;
					mid = pid + "/" + mid;
				}else{
					pid = "";
				}

				// search aliases
				var candidateLength = 0,
					candidate = 0;
				forEach(aliases, function(pair){
					var match = mid.match(pair[0]);
					if(match && match.length>candidateLength){
						candidate = isFunction(pair[1]) ? mid.replace(pair[0], pair[1]) : pair[1];
					}
				});
				if(candidate){
					return getModuleInfo_(candidate, 0, packs, modules, baseUrl, packageMapProg, pathsMapProg, alwaysCreate);
				}

				result = modules[mid];
				if(result){
					return alwaysCreate ? makeModuleInfo(result.pid, result.mid, result.pack, result.url, cacheId) : modules[mid];
				}
			}
			// get here iff the sought-after module does not yet exist; therefore, we need to compute the URL given the
			// fully resolved (i.e., all relative indicators and package mapping resolved) module id

			mapItem = runMapProg(mid, pathsMapProg);
			if(mapItem){
				url = mapItem[1] + mid.substring(mapItem[3] - 1);
			}else if(pid){
				url = pack.location + "/" + midInPackage;
			}else if(has("config-tlmSiblingOfDojo")){
				url = "../" + mid;
			}else{
				url = mid;
			}
			// if result is not absolute, add baseUrl
			if(!(/(^\/)|(\:)/.test(url))){
				url = baseUrl + url;
			}
			url += ".js";
			return makeModuleInfo(pid, mid, pack, compactPath(url), cacheId);
		},

		getModuleInfo = function(mid, referenceModule){
			return getModuleInfo_(mid, referenceModule, packs, modules, req.baseUrl, packageMapProg, pathsMapProg);
		},

		resolvePluginResourceId = function(plugin, prid, referenceModule){
			return plugin.normalize ? plugin.normalize(prid, function(mid){return toAbsMid(mid, referenceModule);}) : toAbsMid(prid, referenceModule);
		},

		dynamicPluginUidGenerator = 0,

		getModule = function(mid, referenceModule, immediate){
			// compute and optionally construct (if necessary) the module implied by the mid with respect to referenceModule
			var match, plugin, prid, result;
			match = mid.match(/^(.+?)\!(.*)$/);
			if(match){
				// name was <plugin-module>!<plugin-resource-id>
				plugin = getModule(match[1], referenceModule, immediate);

				if(0 && legacyMode == sync && !plugin.executed){
					injectModule(plugin);
					if(plugin.injected===arrived && !plugin.executed){
						checkCompleteGuard++;
						execModule(plugin);
						checkIdle();
					}
					if(plugin.executed){
						promoteModuleToPlugin(plugin);
					}else{
						// we are in xdomain mode for some reason
						execQ.unshift(plugin);
					}
				}



				if(plugin.executed === executed && !plugin.load){
					// executed the module not knowing it was a plugin
					promoteModuleToPlugin(plugin);
				}

				// if the plugin has not been loaded, then can't resolve the prid and  must assume this plugin is dynamic until we find out otherwise
				if(plugin.load){
					prid = resolvePluginResourceId(plugin, match[2], referenceModule);
					mid = (plugin.mid + "!" + (plugin.dynamic ? ++dynamicPluginUidGenerator + "!" : "") + prid);
				}else{
					prid = match[2];
					mid = plugin.mid + "!" + (++dynamicPluginUidGenerator) + "!waitingForPlugin";
				}
				result = {plugin:plugin, mid:mid, req:createRequire(referenceModule), prid:prid};
			}else{
				result = getModuleInfo(mid, referenceModule);
			}
			return modules[result.mid] || (!immediate && (modules[result.mid] = result));
		},

		toAbsMid = req.toAbsMid = function(mid, referenceModule){
			return getModuleInfo(mid, referenceModule).mid;
		},

		toUrl = req.toUrl = function(name, referenceModule){
			var moduleInfo = getModuleInfo(name+"/x", referenceModule),
				url = moduleInfo.url;
			return fixupUrl(moduleInfo.pid===0 ?
				// if pid===0, then name had a protocol or absolute path; either way, toUrl is the identify function in such cases
				name :
				// "/x.js" since getModuleInfo automatically appends ".js" and we appended "/x" to make name look likde a module id
				url.substring(0, url.length-5)
			);
		},

		nonModuleProps = {
			injected: arrived,
			executed: executed,
			def: nonmodule,
			result: nonmodule
		},

		makeCjs = function(mid){
			return modules[mid] = mix({mid:mid}, nonModuleProps);
		},

		cjsRequireModule = makeCjs("require"),
		cjsExportsModule = makeCjs("exports"),
		cjsModuleModule = makeCjs("module"),

		runFactory = function(module, args){
			req.trace("loader-run-factory", [module.mid]);
			var factory = module.def,
				result;
			0 && syncExecStack.unshift(module);
			if(has("config-dojo-loader-catches")){
				try{
					result= isFunction(factory) ? factory.apply(null, args) : factory;
				}catch(e){
					signal(error, module.result = makeError("factoryThrew", [module, e]));
				}
			}else{
				result= isFunction(factory) ? factory.apply(null, args) : factory;
			}
			module.result = result===undefined && module.cjs ? module.cjs.exports : result;
			0 && syncExecStack.shift(module);
		},

		abortExec = {},

		defOrder = 0,

		promoteModuleToPlugin = function(pluginModule){
			var plugin = pluginModule.result;
			pluginModule.dynamic = plugin.dynamic;
			pluginModule.normalize = plugin.normalize;
			pluginModule.load = plugin.load;
			return pluginModule;
		},

		resolvePluginLoadQ = function(plugin){
			// plugins is a newly executed module that has a loadQ waiting to run

			// step 1: traverse the loadQ and fixup the mid and prid; remember the map from original mid to new mid
			// recall the original mid was created before the plugin was on board and therefore it was impossible to
			// compute the final mid; accordingly, prid may or may not change, but the mid will definitely change
			var map = {};
			forEach(plugin.loadQ, function(pseudoPluginResource){
				// manufacture and insert the real module in modules
				var pseudoMid = pseudoPluginResource.mid,
					prid = resolvePluginResourceId(plugin, pseudoPluginResource.prid, pseudoPluginResource.req.module),
					mid = plugin.dynamic ? pseudoPluginResource.mid.replace(/waitingForPlugin$/, prid) : (plugin.mid + "!" + prid),
					pluginResource = mix(mix({}, pseudoPluginResource), {mid:mid, prid:prid, injected:0});
				if(!modules[mid]){
					// create a new (the real) plugin resource and inject it normally now that the plugin is on board
					injectPlugin(modules[mid] = pluginResource);
				} // else this was a duplicate request for the same (plugin, rid) for a nondynamic plugin

				// pluginResource is really just a placeholder with the wrong mid (because we couldn't calculate it until the plugin was on board)
				// mark is as arrived and delete it from modules; the real module was requested above
				map[pseudoPluginResource.mid] = modules[mid];
				setArrived(pseudoPluginResource);
				delete modules[pseudoPluginResource.mid];
			});
			plugin.loadQ = 0;

			// step2: replace all references to any placeholder modules with real modules
			var substituteModules = function(module){
				for(var replacement, deps = module.deps || [], i = 0; i<deps.length; i++){
					replacement = map[deps[i].mid];
					if(replacement){
						deps[i] = replacement;
					}
				}
			};
			for(var p in modules){
				substituteModules(modules[p]);
			}
			forEach(execQ, substituteModules);
		},

		finishExec = function(module){
			req.trace("loader-finish-exec", [module.mid]);
			module.executed = executed;
			module.defOrder = defOrder++;
			0 && forEach(module.provides, function(cb){ cb(); });
			if(module.loadQ){
				// the module was a plugin
				promoteModuleToPlugin(module);
				resolvePluginLoadQ(module);
			}
			// remove all occurences of this module from the execQ
			for(i = 0; i < execQ.length;){
				if(execQ[i] === module){
					execQ.splice(i, 1);
				}else{
					i++;
				}
			}
		},

		circleTrace = [],

		execModule = function(module, strict){
			// run the dependency vector, then run the factory for module
			if(module.executed === executing){
				req.trace("loader-circular-dependency", [circleTrace.concat(mid).join("->")]);
				return (!module.def || strict) ? abortExec :  (module.cjs && module.cjs.exports);
			}
			// at this point the module is either not executed or fully executed


			if(!module.executed){
				if(!module.def){
					return abortExec;
				}
				var mid = module.mid,
					deps = module.deps || [],
					arg, argResult,
					args = [],
					i = 0;

				if(0){
					circleTrace.push(mid);
					req.trace("loader-exec-module", ["exec", circleTrace.length, mid]);
				}

				// for circular dependencies, assume the first module encountered was executed OK
				// modules that circularly depend on a module that has not run its factory will get
				// the premade cjs.exports===module.result. They can take a reference to this object and/or
				// add properties to it. When the module finally runs its factory, the factory can
				// read/write/replace this object. Notice that so long as the object isn't replaced, any
				// reference taken earlier while walking the deps list is still valid.
				module.executed = executing;
				while(i < deps.length){
					arg = deps[i++];
					argResult = ((arg === cjsRequireModule) ? createRequire(module) :
									((arg === cjsExportsModule) ? module.cjs.exports :
										((arg === cjsModuleModule) ? module.cjs :
											execModule(arg, strict))));
					if(argResult === abortExec){
						module.executed = 0;
						req.trace("loader-exec-module", ["abort", mid]);
						0 && circleTrace.pop();
						return abortExec;
					}
					args.push(argResult);
				}
				runFactory(module, args);
				finishExec(module);
			}
			// at this point the module is guaranteed fully executed

			0 && circleTrace.pop();
			return module.result;
		},


		checkCompleteGuard =  0,

		checkComplete = function(){
			// keep going through the execQ as long as at least one factory is executed
			// plugins, recursion, cached modules all make for many execution path possibilities
			if(checkCompleteGuard){
				return;
			}
			checkCompleteGuard++;
			checkDojoRequirePlugin();
			for(var currentDefOrder, module, i = 0; i < execQ.length;){
				currentDefOrder = defOrder;
				module = execQ[i];
				execModule(module);
				if(currentDefOrder!=defOrder){
					// defOrder was bumped one or more times indicating something was executed (note, this indicates
					// the execQ was modified, maybe a lot (for example a later module causes an earlier module to execute)
					checkDojoRequirePlugin();
					i = 0;
				}else{
					// nothing happened; check the next module in the exec queue
					i++;
				}
			}
			checkIdle();
		},

		checkIdle = function(){
			checkCompleteGuard--;
			if(execComplete()){
				signal("idle", []);
			}
		};


	if(0){
		req.undef = function(moduleId, referenceModule){
			// In order to reload a module, it must be undefined (this routine) and then re-requested.
			// This is useful for testing frameworks (at least).
			var module = getModule(moduleId, referenceModule);
			setArrived(module);
			delete modules[module.mid];
		};
	}

	if(1){
		if(has("dojo-loader-eval-hint-url")===undefined){
			has.add("dojo-loader-eval-hint-url", 1);
		}

		var fixupUrl= function(url){
				url += ""; // make sure url is a Javascript string (some paths may be a Java string)
				return url + (cacheBust ? ((/\?/.test(url) ? "&" : "?") + cacheBust) : "");
			},

			injectPlugin = function(
				module
			){
				// injects the plugin module given by module; may have to inject the plugin itself
				var plugin = module.plugin;

				if(plugin.executed === executed && !plugin.load){
					// executed the module not knowing it was a plugin
					promoteModuleToPlugin(plugin);
				}

				var onLoad = function(def){
						module.result = def;
						setArrived(module);
						finishExec(module);
						checkComplete();
					};

				if(plugin.load){
					plugin.load(module.prid, module.req, onLoad);
				}else if(plugin.loadQ){
					plugin.loadQ.push(module);
				}else{
					// the unshift instead of push is important: we don't want plugins to execute as
					// dependencies of some other module because this may cause circles when the plugin
					// loadQ is run; also, generally, we want plugins to run early since they may load
					// several other modules and therefore can potentially unblock many modules
					plugin.loadQ = [module];
					execQ.unshift(plugin);
					injectModule(plugin);
				}
			},

			// for IE, injecting a module may result in a recursive execution if the module is in the cache

			cached = 0,

			injectingModule = 0,

			injectingCachedModule = 0,

			evalModuleText = function(text, module){
				// see def() for the injectingCachedModule bracket; it simply causes a short, safe curcuit
				injectingCachedModule = 1;
				if(has("config-dojo-loader-catches")){
					try{
						if(text===cached){
							cached.call(null);
						}else{
							req.eval(text, has("dojo-loader-eval-hint-url") ? module.url : module.mid);
						}
					}catch(e){
						signal(error, makeError("evalModuleThrew", module));
					}
				}else{
					if(text===cached){
						cached.call(null);
					}else{
						req.eval(text, has("dojo-loader-eval-hint-url") ? module.url : module.mid);
					}
				}
				injectingCachedModule = 0;
			},

			injectModule = function(module){
				// Inject the module. In the browser environment, this means appending a script element into
				// the document; in other environments, it means loading a file.
				//
				// If in synchronous mode, then get the module synchronously if it's not xdomainLoading.

				var mid = module.mid,
					url = module.url;
				if(module.executed || module.injected || waiting[mid] || (module.url && ((module.pack && waiting[module.url]===module.pack) || waiting[module.url]==1))){
					return;
				}
				setRequested(module);

				if(0){
					var viaCombo = 0;
					if(module.plugin && module.plugin.isCombo){
						// a combo plugin; therefore, must be handled by combo service
						// the prid should have already been converted to a URL (if required by the plugin) during
						// the normalze process; in any event, there is no way for the loader to know how to
						// to the conversion; therefore the third argument is zero
						req.combo.add(module.plugin.mid, module.prid, 0, req);
						viaCombo = 1;
					}else if(!module.plugin){
						viaCombo = req.combo.add(0, module.mid, module.url, req);
					}
					if(viaCombo){
						comboPending= 1;
						return;
					}
				}

				if(module.plugin){
					injectPlugin(module);
					return;
				} // else a normal module (not a plugin)


				var onLoadCallback = function(){
					runDefQ(module);
					if(module.injected !== arrived){
						// the script that contained the module arrived and has been executed yet
						// nothing was added to the defQ (so it wasn't an AMD module) and the module
						// wasn't marked as arrived by dojo.provide (so it wasn't a v1.6- module);
						// therefore, it must not have been a module; adjust state accordingly
						setArrived(module);
						mix(module, nonModuleProps);
					}

					if(0 && legacyMode){
						// must call checkComplete even in for sync loader because we may be in xdomainLoading mode;
						// but, if xd loading, then don't call checkComplete until out of the current sync traversal
						// in order to preserve order of execution of the dojo.required modules
						!syncExecStack.length && checkComplete();
					}else{
						checkComplete();
					}
				};
				cached = cache[mid] || cache[module.cacheId];
				if(cached){
					req.trace("loader-inject", ["cache", module.mid, url]);
					evalModuleText(cached, module);
					onLoadCallback();
					return;
				}
				if(0 && legacyMode){
					if(module.isXd){
						// switch to async mode temporarily; if current legacyMode!=sync, then is must be one of {legacyAsync, xd, false}
						legacyMode==sync && (legacyMode = xd);
						// fall through and load via script injection
					}else if(module.isAmd && legacyMode!=sync){
						// fall through and load via script injection
					}else{
						// mode may be sync, xd/legacyAsync, or async; module may be AMD or legacy; but module is always located on the same domain
						var xhrCallback = function(text){
							if(legacyMode==sync){
								// the top of syncExecStack gives the current synchronously executing module; the loader needs
								// to know this if it has to switch to async loading in the middle of evaluating a legacy module
								// this happens when a modules dojo.require's a module that must be loaded async because it's xdomain
								// (using unshift/shift because there is no back() methods for Javascript arrays)
								syncExecStack.unshift(module);
								evalModuleText(text, module);
								syncExecStack.shift();

								// maybe the module was an AMD module
								runDefQ(module);

								// legacy modules never get to defineModule() => cjs and injected never set; also evaluation implies executing
								if(!module.cjs){
									setArrived(module);
									finishExec(module);
								}

								if(module.finish){
									// while synchronously evaluating this module, dojo.require was applied referencing a module
									// that had to be loaded async; therefore, the loader stopped answering all dojo.require
									// requests so they could be answered completely in the correct sequence; module.finish gives
									// the list of dojo.requires that must be re-applied once all target modules are available;
									// make a synthetic module to execute the dojo.require's in the correct order

									// compute a guarnateed-unique mid for the synthetic finish module; remember the finish vector; remove it from the reference module
									// TODO: can we just leave the module.finish...what's it hurting?
									var finishMid = mid + "*finish",
										finish = module.finish;
									delete module.finish;

									def(finishMid, ["dojo", ("dojo/require!" + finish.join(",")).replace(/\./g, "/")], function(dojo){
										forEach(finish, function(mid){ dojo.require(mid); });
									});
									// unshift, not push, which causes the current traversal to be reattempted from the top
									execQ.unshift(getModule(finishMid));
								}
								onLoadCallback();
							}else{
								text = transformToAmd(module, text);
								if(text){
									evalModuleText(text, module);
									onLoadCallback();
								}else{
									// if transformToAmd returned falsy, then the module was already AMD and it can be script-injected
									// do so to improve debugability(even though it means another download...which probably won't happen with a good browser cache)
									injectingModule = module;
									req.injectUrl(fixupUrl(url), onLoadCallback, module);
									injectingModule = 0;
								}
							}
						};

						req.trace("loader-inject", ["xhr", module.mid, url, legacyMode!=sync]);
						if(has("config-dojo-loader-catches")){
							try{
								req.getText(url, legacyMode!=sync, xhrCallback);
							}catch(e){
								signal(error, makeError("xhrInjectFailed", [module, e]));
							}
						}else{
							req.getText(url, legacyMode!=sync, xhrCallback);
						}
						return;
					}
				} // else async mode or fell through in xdomain loading mode; either way, load by script injection
				req.trace("loader-inject", ["script", module.mid, url]);
				injectingModule = module;
				req.injectUrl(fixupUrl(url), onLoadCallback, module);
				injectingModule = 0;
			},

			defineModule = function(module, deps, def){
				req.trace("loader-define-module", [module.mid, deps]);

				if(0 && module.plugin && module.plugin.isCombo){
					// the module is a plugin resource loaded by the combo service
					// note: check for module.plugin should be enough since normal plugin resources should
					// not follow this path; module.plugin.isCombo is future-proofing belt and suspenders
					module.result = isFunction(def) ? def() : def;
					setArrived(module);
					finishExec(module);
					return module;
				};

				var mid = module.mid;
				if(module.injected === arrived){
					signal(error, makeError("multipleDefine", module));
					return module;
				}
				mix(module, {
					deps: deps,
					def: def,
					cjs: {
						id: module.mid,
						uri: module.url,
						exports: (module.result = {}),
						setExports: function(exports){
							module.cjs.exports = exports;
						}
					}
				});

				// resolve deps with respect to this module
				for(var i = 0; i < deps.length; i++){
					deps[i] = getModule(deps[i], module);
				}

				if(0 && legacyMode && !waiting[mid]){
					// the module showed up without being asked for; it was probably in a <script> element
					injectDependencies(module);
					execQ.push(module);
					checkComplete();
				}
				setArrived(module);

				if(!isFunction(def) && !deps.length){
					module.result = def;
					finishExec(module);
				}

				return module;
			},

			runDefQ = function(referenceModule, mids){
				// defQ is an array of [id, dependencies, factory]
				// mids (if any) is a vector of mids given by a combo service
				var definedModules = [],
					module, args;
				while(defQ.length){
					args = defQ.shift();
					mids && (args[0]= mids.shift());
					// explicit define indicates possible multiple modules in a single file; delay injecting dependencies until defQ fully
					// processed since modules earlier in the queue depend on already-arrived modules that are later in the queue
					// TODO: what if no args[0] and no referenceModule
					module = (args[0] && getModule(args[0])) || referenceModule;
					definedModules.push([module, args[1], args[2]]);
				}
				consumePendingCacheInsert(referenceModule);
				forEach(definedModules, function(args){
					injectDependencies(defineModule.apply(null, args));
				});
			};
	}

	var timerId = 0,
		clearTimer = noop,
		startTimer = noop;
	if(1){
		// Timer machinery that monitors how long the loader is waiting and signals an error when the timer runs out.
		clearTimer = function(){
			timerId && clearTimeout(timerId);
			timerId = 0;
		},

		startTimer = function(){
			clearTimer();
			req.waitms && (timerId = setTimeout(function(){
					clearTimer();
					signal(error, makeError("timeout", waiting));
			}, req.waitms));
		};
	}

	if(1){
		has.add("ie-event-behavior", doc.attachEvent && (typeof opera === "undefined" || opera.toString() != "[object Opera]"));
	}

	if(1 && (1 || 1)){
		var domOn = function(node, eventName, ieEventName, handler){
				// Add an event listener to a DOM node using the API appropriate for the current browser;
				// return a function that will disconnect the listener.
				if(!has("ie-event-behavior")){
					node.addEventListener(eventName, handler, false);
					return function(){
						node.removeEventListener(eventName, handler, false);
					};
				}else{
					node.attachEvent(ieEventName, handler);
					return function(){
						node.detachEvent(ieEventName, handler);
					};
				}
			},
			windowOnLoadListener = domOn(window, "load", "onload", function(){
				req.pageLoaded = 1;
				doc.readyState!="complete" && (doc.readyState = "complete");
				windowOnLoadListener();
			});

		if(1){
			// if the loader is on the page, there must be at least one script element
			// getting its parent and then doing insertBefore solves the "Operation Aborted"
			// error in IE from appending to a node that isn't properly closed; see
			// dojo/tests/_base/loader/requirejs/simple-badbase.html for an example
			var sibling = doc.getElementsByTagName("script")[0],
				insertPoint= sibling.parentNode;
			req.injectUrl = function(url, callback, owner){
				// insert a script element to the insert-point element with src=url;
				// apply callback upon detecting the script has loaded.

				startTimer();
				var node = owner.node = doc.createElement("script"),
					onLoad = function(e){
						e = e || window.event;
						var node = e.target || e.srcElement;
						if(e.type === "load" || /complete|loaded/.test(node.readyState)){
							disconnector();
							callback && callback();
						}
					},
					disconnector = domOn(node, "load", "onreadystatechange", onLoad);
				node.type = "text/javascript";
				node.charset = "utf-8";
				node.src = url;
				insertPoint.insertBefore(node, sibling);
				return node;
			};
		}
	}

	if(0){
		req.log = function(){
			try{
				for(var i = 0; i < arguments.length; i++){
					console.log(arguments[i]);
				}
			}catch(e){}
		};
	}else{
		req.log = noop;
	}

	if(0){
		var trace = req.trace = function(
			group,	// the trace group to which this application belongs
			args	// the contents of the trace
		){
			///
			// Tracing interface by group.
			//
			// Sends the contents of args to the console iff (req.trace.on && req.trace[group])

			if(trace.on && trace.group[group]){
				signal("trace", [group, args]);
				for(var arg, dump = [], text= "trace:" + group + (args.length ? (":" + args[0]) : ""), i= 1; i<args.length;){
					arg = args[i++];
					if(isString(arg)){
						text += ", " + arg;
					}else{
						dump.push(arg);
					}
				}
				req.log(text);
				dump.length && dump.push(".");
				req.log.apply(req, dump);
			}
		};
		mix(trace, {
			on:1,
			group:{},
			set:function(group, value){
				if(isString(group)){
					trace.group[group]= value;
				}else{
					mix(trace.group, group);
				}
			}
		});
		trace.set(mix(mix(mix({}, defaultConfig.trace), userConfig.trace), dojoSniffConfig.trace));
		on("config", function(config){
			config.trace && trace.set(config.trace);
		});
	}else{
		req.trace = noop;
	}

	var def = function(
		mid,		  //(commonjs.moduleId, optional) list of modules to be loaded before running factory
		dependencies, //(array of commonjs.moduleId, optional)
		factory		  //(any)
	){
		///
		// Advises the loader of a module factory. //Implements http://wiki.commonjs.org/wiki/Modules/AsynchronousDefinition.
		///
		//note
		// CommonJS factory scan courtesy of http://requirejs.org

		var arity = arguments.length,
			args = 0,
			defaultDeps = ["require", "exports", "module"];

		if(0){
			if(arity == 1 && isFunction(mid)){
				dependencies = [];
				mid.toString()
				.replace(/(\/\*([\s\S]*?)\*\/|\/\/(.*)$)/mg, "")
				.replace(/require\(["']([\w\!\-_\.\/]+)["']\)/g, function (match, dep){
					dependencies.push(dep);
			});
				args = [0, defaultDeps.concat(dependencies), mid];
			}
		}
		if(!args){
			args = arity == 1 ? [0, defaultDeps, mid] :
				(arity == 2 ? (isArray(mid) ? [0, mid, dependencies] : (isFunction(dependencies) ? [mid, defaultDeps, dependencies] : [mid, [], dependencies])) :
					[mid, dependencies, factory]);
		}
		req.trace("loader-define", args.slice(0, 2));
		var targetModule = args[0] && getModule(args[0]),
			module;
		if(targetModule && !waiting[targetModule.mid]){
			// given a mid that hasn't been requested; therefore, defined through means other than injecting
			// consequent to a require() or define() application; examples include defining modules on-the-fly
			// due to some code path or including a module in a script element. In any case,
			// there is no callback waiting to finish processing and nothing to trigger the defQ and the
			// dependencies are never requested; therefore, do it here.
			injectDependencies(defineModule(targetModule, args[1], args[2]));
		}else if(!has("ie-event-behavior") || !1 || injectingCachedModule){
			// not IE path: anonymous module and therefore must have been injected; therefore, onLoad will fire immediately
			// after script finishes being evaluated and the defQ can be run from that callback to detect the module id
			defQ.push(args);
		}else{
			// IE path: possibly anonymous module and therefore injected; therefore, cannot depend on 1-to-1,
			// in-order exec of onLoad with script eval (since it's IE) and must manually detect here
			targetModule = targetModule || injectingModule;
			if(!targetModule){
				for(mid in waiting){
					module = modules[mid];
					if(module && module.node && module.node.readyState === 'interactive'){
						targetModule = module;
						break;
					}
				}
				if(0 && !targetModule){
					for(var i = 0; i<combosPending.length; i++){
						targetModule = combosPending[i];
						if(targetModule.node && targetModule.node.readyState === 'interactive'){
							break;
						}
						targetModule= 0;
					}
				}
			}
			if(0 && isArray(targetModule)){
				injectDependencies(defineModule(getModule(targetModule.shift()), args[1], args[2]));
				if(!targetModule.length){
					combosPending.splice(i, 1);
				}
			}else if(targetModule){
				consumePendingCacheInsert(targetModule);
				injectDependencies(defineModule(targetModule, args[1], args[2]));
			}else{
				signal(error, makeError("ieDefineFailed", args[0]));
			}
			checkComplete();
		}
	};
	def.amd = {
		vendor:"dojotoolkit.org"
	};

	if(0){
		req.def = def;
	}

	// allow config to override default implemention of named functions; this is useful for
	// non-browser environments, e.g., overriding injectUrl, getText, log, etc. in node.js, Rhino, etc.
	// also useful for testing and monkey patching loader
	mix(mix(req, defaultConfig.loaderPatch), userConfig.loaderPatch);

	// now that req is fully initialized and won't change, we can hook it up to the error signal
	on(error, function(arg){
		try{
			console.error(arg);
			if(arg instanceof Error){
				for(var p in arg){
					console.log(p + ":", arg[p]);
				}
				console.log(".");
			}
		}catch(e){}
	});

	// always publish these
	mix(req, {
		uid:uid,
		cache:cache,
		packs:packs
	});


	if(0){
		mix(req, {
			// these may be interesting to look at when debugging
			paths:paths,
			aliases:aliases,
			packageMap:packageMap,
			modules:modules,
			legacyMode:legacyMode,
			execQ:execQ,
			defQ:defQ,
			waiting:waiting,

			// these are used for testing
			// TODO: move testing infrastructure to a different has feature
			pathsMapProg:pathsMapProg,
			packageMapProg:packageMapProg,
			listenerQueues:listenerQueues,

			// these are used by the builder (at least)
			computeMapProg:computeMapProg,
			runMapProg:runMapProg,
			compactPath:compactPath,
			getModuleInfo:getModuleInfo_
		});
	}

	// the loader can be defined exactly once; look for global define which is the symbol AMD loaders are
	// *required* to define (as opposed to require, which is optional)
	if(global.define){
		if(0){
			signal(error, makeError("defineAlreadyDefined", 0));
		}
	}else{
		global.define = def;
		global.require = req;
	}

	if(0 && req.combo && req.combo.plugins){
		var plugins = req.combo.plugins,
			pluginName;
		for(pluginName in plugins){
			mix(mix(getModule(pluginName), plugins[pluginName]), {isCombo:1, executed:"executed", load:1});
		}
	}

	if(1){
		var bootDeps = dojoSniffConfig.deps ||  userConfig.deps || defaultConfig.deps,
			bootCallback = dojoSniffConfig.callback || userConfig.callback || defaultConfig.callback;
		req.boot = (bootDeps || bootCallback) ? [bootDeps || [], bootCallback] : 0;
	}
	if(!1){
		!req.async && req(["dojo"]);
		req.boot && req.apply(null, req.boot);
	}
})
(this.dojoConfig || this.djConfig || this.require || {}, {
		async:0,
		hasCache:{
				'config-selectorEngine':"acme",
				'config-tlmSiblingOfDojo':1,
				'dojo-built':1,
				'dojo-loader':1,
				dom:1,
				'host-browser':1
		},
		packages:[
				{
					 location:"../dijit",
					 name:"dijit"
				},
				{
					 location:"../dojox",
					 name:"dojox"
				},
				{
					 location:".",
					 name:"dojo"
				}
		]
});require({cache:{
'dojo/dom-geometry':function(){
define(["./_base/sniff", "./_base/window","./dom", "./dom-style"],
		function(has, win, dom, style){
	// module:
	//		dojo/dom-geometry
	// summary:
	//		This module defines the core dojo DOM geometry API.

	var geom = {};  // the result object

	// Box functions will assume this model.
	// On IE/Opera, BORDER_BOX will be set if the primary document is in quirks mode.
	// Can be set to change behavior of box setters.

	// can be either:
	//	"border-box"
	//	"content-box" (default)
	geom.boxModel = "content-box";

	// We punt per-node box mode testing completely.
	// If anybody cares, we can provide an additional (optional) unit
	// that overrides existing code to include per-node box sensitivity.

	// Opera documentation claims that Opera 9 uses border-box in BackCompat mode.
	// but experiments (Opera 9.10.8679 on Windows Vista) indicate that it actually continues to use content-box.
	// IIRC, earlier versions of Opera did in fact use border-box.
	// Opera guys, this is really confusing. Opera being broken in quirks mode is not our fault.

		if(has("ie") /*|| has("opera")*/){
		// client code may have to adjust if compatMode varies across iframes
		geom.boxModel = document.compatMode == "BackCompat" ? "border-box" : "content-box";
	}
	
	// =============================
	// Box Functions
	// =============================

	/*=====
	dojo.getPadExtents = function(node, computedStyle){
		// summary:
		//		Returns object with special values specifically useful for node
		//		fitting.
		// description:
		//		Returns an object with `w`, `h`, `l`, `t` properties:
		//	|		l/t/r/b = left/top/right/bottom padding (respectively)
		//	|		w = the total of the left and right padding
		//	|		h = the total of the top and bottom padding
		//		If 'node' has position, l/t forms the origin for child nodes.
		//		The w/h are used for calculating boxes.
		//		Normally application code will not need to invoke this
		//		directly, and will use the ...box... functions instead.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.


	};
	=====*/

	/*=====
	dojo._getPadExtents = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getPadExtents`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getBorderExtents = function(node, computedStyle){
		// summary:
		//		returns an object with properties useful for noting the border
		//		dimensions.
		// description:
		//		* l/t/r/b = the sum of left/top/right/bottom border (respectively)
		//		* w = the sum of the left and right border
		//		* h = the sum of the top and bottom border
		//
		//		The w/h are used for calculating boxes.
		//		Normally application code will not need to invoke this
		//		directly, and will use the ...box... functions instead.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.


	};
	=====*/

	/*=====
	dojo._getBorderExtents = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getBorderExtents`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getPadBorderExtents = function(node, computedStyle){
		// summary:
		//		Returns object with properties useful for box fitting with
		//		regards to padding.
		// description:
		//		* l/t/r/b = the sum of left/top/right/bottom padding and left/top/right/bottom border (respectively)
		//		* w = the sum of the left and right padding and border
		//		* h = the sum of the top and bottom padding and border
		//
		//		The w/h are used for calculating boxes.
		//		Normally application code will not need to invoke this
		//		directly, and will use the ...box... functions instead.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.


	};
	=====*/

	/*=====
	dojo._getPadBorderExtents = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getPadBorderExtents`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getMarginExtents = function(node, computedStyle){
		// summary:
		//		returns object with properties useful for box fitting with
		//		regards to box margins (i.e., the outer-box).
		//
		//		* l/t = marginLeft, marginTop, respectively
		//		* w = total width, margin inclusive
		//		* h = total height, margin inclusive
		//
		//		The w/h are used for calculating boxes.
		//		Normally application code will not need to invoke this
		//		directly, and will use the ...box... functions instead.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo._getMarginExtents = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getMarginExtents`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getMarginSize = function(node, computedStyle){
		// summary:
		//		returns an object that encodes the width and height of
		//		the node's margin box
		// node: DOMNode|String
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo._getMarginSize = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getMarginSize`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getMarginBox = function(node, computedStyle){
		// summary:
		//		returns an object that encodes the width, height, left and top
		//		positions of the node's margin box.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo._getMarginBox = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getMarginBox`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.setMarginBox = function(node, box, computedStyle){
		// summary:
		//		sets the size of the node's margin box and placement
		//		(left/top), irrespective of box model. Think of it as a
		//		passthrough to setBox that handles box-model vagaries for
		//		you.
		// node: DOMNode
		// box: Object
		//      hash with optional "l", "t", "w", and "h" properties for "left", "right", "width", and "height"
		//      respectively. All specified properties should have numeric values in whole pixels.
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo.getContentBox = function(node, computedStyle){
		// summary:
		//		Returns an object that encodes the width, height, left and top
		//		positions of the node's content box, irrespective of the
		//		current box model.
		// node: DOMNode
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo._getContentBox = function(node, computedStyle){
		// summary:
		//		Existing alias for `dojo.getContentBox`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.setContentSize = function(node, box, computedStyle){
		// summary:
		//		Sets the size of the node's contents, irrespective of margins,
		//		padding, or borders.
		// node: DOMNode
		// box: Object
		//      hash with optional "w", and "h" properties for "width", and "height"
		//      respectively. All specified properties should have numeric values in whole pixels.
		// computedStyle: Object?
		// 		This parameter accepts computed styles object.
		// 		If this parameter is omitted, the functions will call 
		//		dojo.getComputedStyle to get one. It is a better way, calling 
		//		dojo.computedStyle once, and then pass the reference to this 
		//		computedStyle parameter. Wherever possible, reuse the returned 
		//		object of dojo.getComputedStyle.
	};
	=====*/

	/*=====
	dojo.isBodyLtr = function(){
		// summary:
		//      Returns true if the current language is left-to-right, and false otherwise.
		// returns: Boolean
	};
	=====*/

	/*=====
	dojo._isBodyLtr = function(){
		// summary:
		//		Existing alias for `dojo.isBodyLtr`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.docScroll = function(){
		// summary:
		//      Returns an object with {node, x, y} with corresponding offsets.
		// returns: Object
	};
	=====*/

	/*=====
	dojo._docScroll = function(){
		// summary:
		//		Existing alias for `dojo.docScroll`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getIeDocumentElementOffset = function(){
		// summary:
		//		returns the offset in x and y from the document body to the
		//		visual edge of the page for IE
		// description:
		//		The following values in IE contain an offset:
		//	|		event.clientX
		//	|		event.clientY
		//	|		node.getBoundingClientRect().left
		//	|		node.getBoundingClientRect().top
		//		But other position related values do not contain this offset,
		//		such as node.offsetLeft, node.offsetTop, node.style.left and
		//		node.style.top. The offset is always (2, 2) in LTR direction.
		//		When the body is in RTL direction, the offset counts the width
		//		of left scroll bar's width.  This function computes the actual
		//		offset.
	};
	=====*/

	/*=====
	dojo._getIeDocumentElementOffset = function(){
		// summary:
		//		Existing alias for `dojo.getIeDocumentElementOffset`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.fixIeBiDiScrollLeft = function(scrollLeft){
		// summary:
		//      In RTL direction, scrollLeft should be a negative value, but IE
		//      returns a positive one. All codes using documentElement.scrollLeft
		//      must call this function to fix this error, otherwise the position
		//      will offset to right when there is a horizontal scrollbar.
		// scrollLeft: NUmber
		// returns: Number
	};
	=====*/

	/*=====
	dojo._fixIeBiDiScrollLeft = function(scrollLeft){
		// summary:
		//		Existing alias for `dojo.fixIeBiDiScrollLeft`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.position = function(node, includeScroll){
		// summary:
		//		Gets the position and size of the passed element relative to
		//		the viewport (if includeScroll==false), or relative to the
		//		document root (if includeScroll==true).
		//
		// description:
		//		Returns an object of the form:
		//			{ x: 100, y: 300, w: 20, h: 15 }
		//		If includeScroll==true, the x and y values will include any
		//		document offsets that may affect the position relative to the
		//		viewport.
		//		Uses the border-box model (inclusive of border and padding but
		//		not margin).  Does not act as a setter.
		// node: DOMNode|String
		// includeScroll: Boolean?
		// returns: Object
	};
	=====*/

	geom.getPadExtents = function getPadExtents(/*DomNode*/node, /*Object*/computedStyle){
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node), px = style.toPixelValue,
			l = px(node, s.paddingLeft), t = px(node, s.paddingTop), r = px(node, s.paddingRight), b = px(node, s.paddingBottom);
		return {l: l, t: t, r: r, b: b, w: l + r, h: t + b};
	};

	var none = "none";

	geom.getBorderExtents = function getBorderExtents(/*DomNode*/node, /*Object*/computedStyle){
		node = dom.byId(node);
		var px = style.toPixelValue, s = computedStyle || style.getComputedStyle(node),
			l = s.borderLeftStyle != none ? px(node, s.borderLeftWidth) : 0,
			t = s.borderTopStyle != none ? px(node, s.borderTopWidth) : 0,
			r = s.borderRightStyle != none ? px(node, s.borderRightWidth) : 0,
			b = s.borderBottomStyle != none ? px(node, s.borderBottomWidth) : 0;
		return {l: l, t: t, r: r, b: b, w: l + r, h: t + b};
	};

	geom.getPadBorderExtents = function getPadBorderExtents(/*DomNode*/node, /*Object*/computedStyle){
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node),
			p = geom.getPadExtents(node, s),
			b = geom.getBorderExtents(node, s);
		return {
			l: p.l + b.l,
			t: p.t + b.t,
			r: p.r + b.r,
			b: p.b + b.b,
			w: p.w + b.w,
			h: p.h + b.h
		};
	};

	geom.getMarginExtents = function getMarginExtents(node, computedStyle){
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node), px = style.toPixelValue,
			l = px(node, s.marginLeft), t = px(node, s.marginTop), r = px(node, s.marginRight), b = px(node, s.marginBottom);
		if(has("webkit") && (s.position != "absolute")){
			// FIXME: Safari's version of the computed right margin
			// is the space between our right edge and the right edge
			// of our offsetParent.
			// What we are looking for is the actual margin value as
			// determined by CSS.
			// Hack solution is to assume left/right margins are the same.
			r = l;
		}
		return {l: l, t: t, r: r, b: b, w: l + r, h: t + b};
	};

	// Box getters work in any box context because offsetWidth/clientWidth
	// are invariant wrt box context
	//
	// They do *not* work for display: inline objects that have padding styles
	// because the user agent ignores padding (it's bogus styling in any case)
	//
	// Be careful with IMGs because they are inline or block depending on
	// browser and browser mode.

	// Although it would be easier to read, there are not separate versions of
	// _getMarginBox for each browser because:
	// 1. the branching is not expensive
	// 2. factoring the shared code wastes cycles (function call overhead)
	// 3. duplicating the shared code wastes bytes

	geom.getMarginBox = function getMarginBox(/*DomNode*/node, /*Object*/computedStyle){
		// summary:
		//		returns an object that encodes the width, height, left and top
		//		positions of the node's margin box.
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node), me = geom.getMarginExtents(node, s),
			l = node.offsetLeft - me.l, t = node.offsetTop - me.t, p = node.parentNode, px = style.toPixelValue, pcs;
				if(has("mozilla")){
			// Mozilla:
			// If offsetParent has a computed overflow != visible, the offsetLeft is decreased
			// by the parent's border.
			// We don't want to compute the parent's style, so instead we examine node's
			// computed left/top which is more stable.
			var sl = parseFloat(s.left), st = parseFloat(s.top);
			if(!isNaN(sl) && !isNaN(st)){
				l = sl, t = st;
			}else{
				// If child's computed left/top are not parseable as a number (e.g. "auto"), we
				// have no choice but to examine the parent's computed style.
				if(p && p.style){
					pcs = style.getComputedStyle(p);
					if(pcs.overflow != "visible"){
						l += pcs.borderLeftStyle != none ? px(node, pcs.borderLeftWidth) : 0;
						t += pcs.borderTopStyle != none ? px(node, pcs.borderTopWidth) : 0;
					}
				}
			}
		}else if(has("opera") || (has("ie") == 8 && !has("quirks"))){
			// On Opera and IE 8, offsetLeft/Top includes the parent's border
			if(p){
				pcs = style.getComputedStyle(p);
				l -= pcs.borderLeftStyle != none ? px(node, pcs.borderLeftWidth) : 0;
				t -= pcs.borderTopStyle != none ? px(node, pcs.borderTopWidth) : 0;
			}
		}
				return {l: l, t: t, w: node.offsetWidth + me.w, h: node.offsetHeight + me.h};
	};

	geom.getContentBox = function getContentBox(node, computedStyle){
		// clientWidth/Height are important since the automatically account for scrollbars
		// fallback to offsetWidth/Height for special cases (see #3378)
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node), w = node.clientWidth, h,
			pe = geom.getPadExtents(node, s), be = geom.getBorderExtents(node, s);
		if(!w){
			w = node.offsetWidth;
			h = node.offsetHeight;
		}else{
			h = node.clientHeight;
			be.w = be.h = 0;
		}
		// On Opera, offsetLeft includes the parent's border
				if(has("opera")){
			pe.l += be.l;
			pe.t += be.t;
		}
				return {l: pe.l, t: pe.t, w: w - pe.w - be.w, h: h - pe.h - be.h};
	};

	// Box setters depend on box context because interpretation of width/height styles
	// vary wrt box context.
	//
	// The value of dojo.boxModel is used to determine box context.
	// dojo.boxModel can be set directly to change behavior.
	//
	// Beware of display: inline objects that have padding styles
	// because the user agent ignores padding (it's a bogus setup anyway)
	//
	// Be careful with IMGs because they are inline or block depending on
	// browser and browser mode.
	//
	// Elements other than DIV may have special quirks, like built-in
	// margins or padding, or values not detectable via computedStyle.
	// In particular, margins on TABLE do not seems to appear
	// at all in computedStyle on Mozilla.

	function setBox(/*DomNode*/node, /*Number?*/l, /*Number?*/t, /*Number?*/w, /*Number?*/h, /*String?*/u){
		// summary:
		//		sets width/height/left/top in the current (native) box-model
		//		dimensions. Uses the unit passed in u.
		// node:
		//		DOM Node reference. Id string not supported for performance
		//		reasons.
		// l:
		//		left offset from parent.
		// t:
		//		top offset from parent.
		// w:
		//		width in current box model.
		// h:
		//		width in current box model.
		// u:
		//		unit measure to use for other measures. Defaults to "px".
		u = u || "px";
		var s = node.style;
		if(!isNaN(l)){
			s.left = l + u;
		}
		if(!isNaN(t)){
			s.top = t + u;
		}
		if(w >= 0){
			s.width = w + u;
		}
		if(h >= 0){
			s.height = h + u;
		}
	}

	function isButtonTag(/*DomNode*/node){
		// summary:
		//		True if the node is BUTTON or INPUT.type="button".
		return node.tagName.toLowerCase() == "button" ||
			node.tagName.toLowerCase() == "input" && (node.getAttribute("type") || "").toLowerCase() == "button"; // boolean
	}

	function usesBorderBox(/*DomNode*/node){
		// summary:
		//		True if the node uses border-box layout.

		// We could test the computed style of node to see if a particular box
		// has been specified, but there are details and we choose not to bother.

		// TABLE and BUTTON (and INPUT type=button) are always border-box by default.
		// If you have assigned a different box to either one via CSS then
		// box functions will break.

		return geom.boxModel == "border-box" || node.tagName.toLowerCase() == "table" || isButtonTag(node); // boolean
	}

	geom.setContentSize = function setContentSize(/*DomNode*/node, /*Object*/box, /*Object*/computedStyle){
		// summary:
		//		Sets the size of the node's contents, irrespective of margins,
		//		padding, or borders.

		node = dom.byId(node);
		var w = box.w, h = box.h;
		if(usesBorderBox(node)){
			var pb = geom.getPadBorderExtents(node, computedStyle);
			if(w >= 0){
				w += pb.w;
			}
			if(h >= 0){
				h += pb.h;
			}
		}
		setBox(node, NaN, NaN, w, h);
	};

	var nilExtents = {l: 0, t: 0, w: 0, h: 0};

	geom.setMarginBox = function setMarginBox(/*DomNode*/node, /*Object*/box, /*Object*/computedStyle){
		node = dom.byId(node);
		var s = computedStyle || style.getComputedStyle(node), w = box.w, h = box.h,
		// Some elements have special padding, margin, and box-model settings.
		// To use box functions you may need to set padding, margin explicitly.
		// Controlling box-model is harder, in a pinch you might set dojo.boxModel.
			pb = usesBorderBox(node) ? nilExtents : geom.getPadBorderExtents(node, s),
			mb = geom.getMarginExtents(node, s);
		if(has("webkit")){
			// on Safari (3.1.2), button nodes with no explicit size have a default margin
			// setting an explicit size eliminates the margin.
			// We have to swizzle the width to get correct margin reading.
			if(isButtonTag(node)){
				var ns = node.style;
				if(w >= 0 && !ns.width){
					ns.width = "4px";
				}
				if(h >= 0 && !ns.height){
					ns.height = "4px";
				}
			}
		}
		if(w >= 0){
			w = Math.max(w - pb.w - mb.w, 0);
		}
		if(h >= 0){
			h = Math.max(h - pb.h - mb.h, 0);
		}
		setBox(node, box.l, box.t, w, h);
	};

	// =============================
	// Positioning
	// =============================

	geom.isBodyLtr = function isBodyLtr(){
		return (win.body().dir || win.doc.documentElement.dir || "ltr").toLowerCase() == "ltr"; // Boolean
	};

	geom.docScroll = function docScroll(){
		var node = win.doc.parentWindow || win.doc.defaultView;   // use UI window, not dojo.global window
		return "pageXOffset" in node ? {x: node.pageXOffset, y: node.pageYOffset } :
			(node = has("quirks") ? win.body() : win.doc.documentElement,
				{x: geom.fixIeBiDiScrollLeft(node.scrollLeft || 0), y: node.scrollTop || 0 });
	};

		geom.getIeDocumentElementOffset = function getIeDocumentElementOffset(){
		//NOTE: assumes we're being called in an IE browser

		var de = win.doc.documentElement; // only deal with HTML element here, position() handles body/quirks

		if(has("ie") < 8){
			var r = de.getBoundingClientRect(), // works well for IE6+
				l = r.left, t = r.top;
			if(has("ie") < 7){
				l += de.clientLeft;	// scrollbar size in strict/RTL, or,
				t += de.clientTop;	// HTML border size in strict
			}
			return {
				x: l < 0 ? 0 : l, // FRAME element border size can lead to inaccurate negative values
				y: t < 0 ? 0 : t
			};
		}else{
			return {
				x: 0,
				y: 0
			};
		}
	};
	
	geom.fixIeBiDiScrollLeft = function fixIeBiDiScrollLeft(/*Integer*/ scrollLeft){
		// In RTL direction, scrollLeft should be a negative value, but IE
		// returns a positive one. All codes using documentElement.scrollLeft
		// must call this function to fix this error, otherwise the position
		// will offset to right when there is a horizontal scrollbar.

				var ie = has("ie");
		if(ie && !geom.isBodyLtr()){
			var qk = has("quirks"),
				de = qk ? win.body() : win.doc.documentElement;
			if(ie == 6 && !qk && win.global.frameElement && de.scrollHeight > de.clientHeight){
				scrollLeft += de.clientLeft; // workaround ie6+strict+rtl+iframe+vertical-scrollbar bug where clientWidth is too small by clientLeft pixels
			}
			return (ie < 8 || qk) ? (scrollLeft + de.clientWidth - de.scrollWidth) : -scrollLeft; // Integer
		}
				return scrollLeft; // Integer
	};

	geom.position = function(/*DomNode*/node, /*Boolean?*/includeScroll){
		node = dom.byId(node);
		var	db = win.body(),
			dh = db.parentNode,
			ret = node.getBoundingClientRect();
		ret = {x: ret.left, y: ret.top, w: ret.right - ret.left, h: ret.bottom - ret.top};
				if(has("ie")){
			// On IE there's a 2px offset that we need to adjust for, see dojo.getIeDocumentElementOffset()
			var offset = geom.getIeDocumentElementOffset();

			// fixes the position in IE, quirks mode
			ret.x -= offset.x + (has("quirks") ? db.clientLeft + db.offsetLeft : 0);
			ret.y -= offset.y + (has("quirks") ? db.clientTop + db.offsetTop : 0);
		}else if(has("ff") == 3){
			// In FF3 you have to subtract the document element margins.
			// Fixed in FF3.5 though.
			var cs = style.getComputedStyle(dh), px = style.toPixelValue;
			ret.x -= px(dh, cs.marginLeft) + px(dh, cs.borderLeftWidth);
			ret.y -= px(dh, cs.marginTop) + px(dh, cs.borderTopWidth);
		}
				// account for document scrolling
		// if offsetParent is used, ret value already includes scroll position
		// so we may have to actually remove that value if !includeScroll
		if(includeScroll){
			var scroll = geom.docScroll();
			ret.x += scroll.x;
			ret.y += scroll.y;
		}

		return ret; // Object
	};

	// random "private" functions wildly used throughout the toolkit

	geom.getMarginSize = function getMarginSize(/*DomNode*/node, /*Object*/computedStyle){
		node = dom.byId(node);
		var me = geom.getMarginExtents(node, computedStyle || style.getComputedStyle(node));
		var size = node.getBoundingClientRect();
		return {
			w: (size.right - size.left) + me.w,
			h: (size.bottom - size.top) + me.h
		}
	};

	geom.normalizeEvent = function(event){
		// summary:
		// 		Normalizes the geometry of a DOM event, normalizing the pageX, pageY,
		// 		offsetX, offsetY, layerX, and layerX properties
		// event: Object
		if(!("layerX" in event)){
			event.layerX = event.offsetX;
			event.layerY = event.offsetY;
		}
		if(!has("dom-addeventlistener")){
			// old IE version
			// FIXME: scroll position query is duped from dojo.html to
			// avoid dependency on that entire module. Now that HTML is in
			// Base, we should convert back to something similar there.
			var se = event.target;
			var doc = (se && se.ownerDocument) || document;
			// DO NOT replace the following to use dojo.body(), in IE, document.documentElement should be used
			// here rather than document.body
			var docBody = has("quirks") ? doc.body : doc.documentElement;
			var offset = geom.getIeDocumentElementOffset();
			event.pageX = event.clientX + geom.fixIeBiDiScrollLeft(docBody.scrollLeft || 0) - offset.x;
			event.pageY = event.clientY + (docBody.scrollTop || 0) - offset.y;
		}
	};

	// TODO: evaluate separate getters/setters for position and sizes?

	return geom;
});

},
'dojo/_base/html':function(){
define(["./kernel", "../dom", "../dom-style", "../dom-attr", "../dom-prop", "../dom-class", "../dom-construct", "../dom-geometry"], function(dojo, dom, style, attr, prop, cls, ctr, geom){
	// module:
	//		dojo/dom
	// summary:
	//		This module is a stub for the core dojo DOM API.

	// mix-in dom
	dojo.byId = dom.byId;
	dojo.isDescendant = dom.isDescendant;
	dojo.setSelectable = dom.setSelectable;

	// mix-in dom-attr
	dojo.getAttr = attr.get;
	dojo.setAttr = attr.set;
	dojo.hasAttr = attr.has;
	dojo.removeAttr = attr.remove;
	dojo.getNodeProp = attr.getNodeProp;

	dojo.attr = function(node, name, value){
		// summary:
		//		Gets or sets an attribute on an HTML element.
		// description:
		//		Handles normalized getting and setting of attributes on DOM
		//		Nodes. If 2 arguments are passed, and a the second argument is a
		//		string, acts as a getter.
		//
		//		If a third argument is passed, or if the second argument is a
		//		map of attributes, acts as a setter.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node: DOMNode|String
		//		id or reference to the element to get or set the attribute on
		// name: String|Object
		//		the name of the attribute to get or set.
		// value: String?
		//		The value to set for the attribute
		// returns:
		//		when used as a getter, the value of the requested attribute
		//		or null if that attribute does not have a specified or
		//		default value;
		//
		//		when used as a setter, the DOM node
		//
		// example:
		//	|	// get the current value of the "foo" attribute on a node
		//	|	dojo.attr(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.attr("nodeId", "foo");
		//
		// example:
		//	|	// use attr() to set the tab index
		//	|	dojo.attr("nodeId", "tabIndex", 3);
		//	|
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.attr("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//	Style is s special case: Only set with an object hash of styles
		//	|	dojo.attr("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//	Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.attr("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.style("someNode", obj);

		if(arguments.length == 2){
			return attr[typeof name == "string" ? "get" : "set"](node, name);
		}
		return attr.set(node, name, value);
	};

	// mix-in dom-class
	dojo.hasClass = cls.contains;
	dojo.addClass = cls.add;
	dojo.removeClass = cls.remove;
	dojo.toggleClass = cls.toggle;
	dojo.replaceClass = cls.replace;

	// mix-in dom-construct
	dojo._toDom = dojo.toDom = ctr.toDom;
	dojo.place = ctr.place;
	dojo.create = ctr.create;
	dojo.empty = function(node){ ctr.empty(node); };
	dojo._destroyElement = dojo.destroy = function(node){ ctr.destroy(node); };

	// mix-in dom-geometry
	dojo._getPadExtents = dojo.getPadExtents = geom.getPadExtents;
	dojo._getBorderExtents = dojo.getBorderExtents = geom.getBorderExtents;
	dojo._getPadBorderExtents = dojo.getPadBorderExtents = geom.getPadBorderExtents;
	dojo._getMarginExtents = dojo.getMarginExtents = geom.getMarginExtents;
	dojo._getMarginSize = dojo.getMarginSize = geom.getMarginSize;
	dojo._getMarginBox = dojo.getMarginBox = geom.getMarginBox;
	dojo.setMarginBox = geom.setMarginBox;
	dojo._getContentBox = dojo.getContentBox = geom.getContentBox;
	dojo.setContentSize = geom.setContentSize;
	dojo._isBodyLtr = dojo.isBodyLtr = geom.isBodyLtr;
	dojo._docScroll = dojo.docScroll = geom.docScroll;
	dojo._getIeDocumentElementOffset = dojo.getIeDocumentElementOffset = geom.getIeDocumentElementOffset;
	dojo._fixIeBiDiScrollLeft = dojo.fixIeBiDiScrollLeft = geom.fixIeBiDiScrollLeft;
	dojo.position = geom.position;

	dojo.marginBox = function marginBox(/*DomNode|String*/node, /*Object?*/box){
		// summary:
		//		Getter/setter for the margin-box of node.
		// description:
		//		Getter/setter for the margin-box of node.
		//		Returns an object in the expected format of box (regardless
		//		if box is passed). The object might look like:
		//			`{ l: 50, t: 200, w: 300: h: 150 }`
		//		for a node offset from its parent 50px to the left, 200px from
		//		the top with a margin width of 300px and a margin-height of
		//		150px.
		// node:
		//		id or reference to DOM Node to get/set box for
		// box:
		//		If passed, denotes that dojo.marginBox() should
		//		update/set the margin box for node. Box is an object in the
		//		above format. All properties are optional if passed.
		// example:
		//		Retrieve the margin box of a passed node
		//	|	var box = dojo.marginBox("someNodeId");
		//	|	console.dir(box);
		//
		// example:
		//		Set a node's margin box to the size of another node
		//	|	var box = dojo.marginBox("someNodeId");
		//	|	dojo.marginBox("someOtherNode", box);
		return box ? geom.setMarginBox(node, box) : geom.getMarginBox(node); // Object
	};

	dojo.contentBox = function contentBox(/*DomNode|String*/node, /*Object?*/box){
		// summary:
		//		Getter/setter for the content-box of node.
		// description:
		//		Returns an object in the expected format of box (regardless if box is passed).
		//		The object might look like:
		//			`{ l: 50, t: 200, w: 300: h: 150 }`
		//		for a node offset from its parent 50px to the left, 200px from
		//		the top with a content width of 300px and a content-height of
		//		150px. Note that the content box may have a much larger border
		//		or margin box, depending on the box model currently in use and
		//		CSS values set/inherited for node.
		//		While the getter will return top and left values, the
		//		setter only accepts setting the width and height.
		// node:
		//		id or reference to DOM Node to get/set box for
		// box:
		//		If passed, denotes that dojo.contentBox() should
		//		update/set the content box for node. Box is an object in the
		//		above format, but only w (width) and h (height) are supported.
		//		All properties are optional if passed.
		return box ? geom.setContentSize(node, box) : geom.getContentBox(node); // Object
	};

	dojo.coords = function(/*DomNode|String*/node, /*Boolean?*/includeScroll){
		// summary:
		//		Deprecated: Use position() for border-box x/y/w/h
		//		or marginBox() for margin-box w/h/l/t.
		//		Returns an object representing a node's size and position.
		//
		// description:
		//		Returns an object that measures margin-box (w)idth/(h)eight
		//		and absolute position x/y of the border-box. Also returned
		//		is computed (l)eft and (t)op values in pixels from the
		//		node's offsetParent as returned from marginBox().
		//		Return value will be in the form:
		//|			{ l: 50, t: 200, w: 300: h: 150, x: 100, y: 300 }
		//		Does not act as a setter. If includeScroll is passed, the x and
		//		y params are affected as one would expect in dojo.position().
		dojo.deprecated("dojo.coords()", "Use dojo.position() or dojo.marginBox().");
		node = dom.byId(node);
		var s = style.getComputedStyle(node), mb = geom.getMarginBox(node, s);
		var abs = geom.position(node, includeScroll);
		mb.x = abs.x;
		mb.y = abs.y;
		return mb;	// Object
	};

	// mix-in dom-prop
	dojo.getProp = prop.get;
	dojo.setProp = prop.set;

	dojo.prop = function(/*DomNode|String*/node, /*String|Object*/name, /*String?*/value){
		// summary:
		//		Gets or sets a property on an HTML element.
		// description:
		//		Handles normalized getting and setting of properties on DOM
		//		Nodes. If 2 arguments are passed, and a the second argument is a
		//		string, acts as a getter.
		//
		//		If a third argument is passed, or if the second argument is a
		//		map of attributes, acts as a setter.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node:
		//		id or reference to the element to get or set the property on
		// name:
		//		the name of the property to get or set.
		// value:
		//		The value to set for the property
		// returns:
		//		when used as a getter, the value of the requested property
		//		or null if that attribute does not have a specified or
		//		default value;
		//
		//		when used as a setter, the DOM node
		//
		// example:
		//	|	// get the current value of the "foo" property on a node
		//	|	dojo.prop(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.prop("nodeId", "foo");
		//
		// example:
		//	|	// use prop() to set the tab index
		//	|	dojo.prop("nodeId", "tabIndex", 3);
		//	|
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.prop("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//	Style is s special case: Only set with an object hash of styles
		//	|	dojo.prop("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//	Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.prop("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.style("someNode", obj);

		if(arguments.length == 2){
			return prop[typeof name == "string" ? "get" : "set"](node, name);
		}
		// setter
		return prop.set(node, name, value);
	};

	// mix-in dom-style
	dojo.getStyle = style.get;
	dojo.setStyle = style.set;
	dojo.getComputedStyle = style.getComputedStyle;
	dojo.__toPixelValue = dojo.toPixelValue = style.toPixelValue;

	dojo.style = function(node, name, value){
		// summary:
		//		Accesses styles on a node. If 2 arguments are
		//		passed, acts as a getter. If 3 arguments are passed, acts
		//		as a setter.
		// description:
		//		Getting the style value uses the computed style for the node, so the value
		//		will be a calculated value, not just the immediate node.style value.
		//		Also when getting values, use specific style names,
		//		like "borderBottomWidth" instead of "border" since compound values like
		//		"border" are not necessarily reflected as expected.
		//		If you want to get node dimensions, use `dojo.marginBox()`,
		//		`dojo.contentBox()` or `dojo.position()`.
		// node: DOMNode|String
		//		id or reference to node to get/set style for
		// name: String?|Object?
		//		the style property to set in DOM-accessor format
		//		("borderWidth", not "border-width") or an object with key/value
		//		pairs suitable for setting each property.
		// value: String?
		//		If passed, sets value on the node for style, handling
		//		cross-browser concerns.  When setting a pixel value,
		//		be sure to include "px" in the value. For instance, top: "200px".
		//		Otherwise, in some cases, some browsers will not apply the style.
		// returns:
		//		when used as a getter, return the computed style of the node if passing in an ID or node,
		//		or return the normalized, computed value for the property when passing in a node and a style property
		// example:
		//		Passing only an ID or node returns the computed style object of
		//		the node:
		//	|	dojo.style("thinger");
		// example:
		//		Passing a node and a style property returns the current
		//		normalized, computed value for that property:
		//	|	dojo.style("thinger", "opacity"); // 1 by default
		//
		// example:
		//		Passing a node, a style property, and a value changes the
		//		current display of the node and returns the new computed value
		//	|	dojo.style("thinger", "opacity", 0.5); // == 0.5
		//
		// example:
		//		Passing a node, an object-style style property sets each of the values in turn and returns the computed style object of the node:
		//	|	dojo.style("thinger", {
		//	|		"opacity": 0.5,
		//	|		"border": "3px solid black",
		//	|		"height": "300px"
		//	|	});
		//
		// example:
		//		When the CSS style property is hyphenated, the JavaScript property is camelCased.
		//		font-size becomes fontSize, and so on.
		//	|	dojo.style("thinger",{
		//	|		fontSize:"14pt",
		//	|		letterSpacing:"1.2em"
		//	|	});
		//
		// example:
		//		dojo.NodeList implements .style() using the same syntax, omitting the "node" parameter, calling
		//		dojo.style() on every element of the list. See: `dojo.query()` and `dojo.NodeList()`
		//	|	dojo.query(".someClassName").style("visibility","hidden");
		//	|	// or
		//	|	dojo.query("#baz > div").style({
		//	|		opacity:0.75,
		//	|		fontSize:"13pt"
		//	|	});

		switch(arguments.length){
			case 1:
				return style.get(node);
			case 2:
				return style[typeof name == "string" ? "get" : "set"](node, name);
		}
		// setter
		return style.set(node, name, value);
	};

	return dojo;
});

},
'dojo/_base/array':function(){
define("dojo/_base/array", ["./kernel", "../has", "./lang"], function(dojo, has, lang){
	// module:
	//		dojo/_base/array
	// summary:
	//		This module defines the Javascript v1.6 array extensions.

	/*=====
	dojo.indexOf = function(arr, value, fromIndex, findLast){
		// summary:
		//		locates the first index of the provided value in the
		//		passed array. If the value is not found, -1 is returned.
		// description:
		//		This method corresponds to the JavaScript 1.6 Array.indexOf method, with one difference: when
		//		run over sparse arrays, the Dojo function invokes the callback for every index whereas JavaScript
		//		1.6's indexOf skips the holes in the sparse array.
		//		For details on this method, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/indexOf
		// arr: Array
		// value: Object
		// fromIndex: Integer?
		// findLast: Boolean?
		// returns: Number
	};
	dojo.lastIndexOf = function(arr, value, fromIndex){
		// summary:
		//		locates the last index of the provided value in the passed
		//		array. If the value is not found, -1 is returned.
		// description:
		//		This method corresponds to the JavaScript 1.6 Array.lastIndexOf method, with one difference: when
		//		run over sparse arrays, the Dojo function invokes the callback for every index whereas JavaScript
		//		1.6's lastIndexOf skips the holes in the sparse array.
		//		For details on this method, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/lastIndexOf
		//	arr: Array,
		//	value: Object,
		//	fromIndex: Integer?
		//	returns: Number
	};
	dojo.forEach = function(arr, callback, thisObject){
		//	summary:
		//		for every item in arr, callback is invoked. Return values are ignored.
		//		If you want to break out of the loop, consider using dojo.every() or dojo.some().
		//		forEach does not allow breaking out of the loop over the items in arr.
		//	arr:
		//		the array to iterate over. If a string, operates on individual characters.
		//	callback:
		//		a function is invoked with three arguments: item, index, and array
		//	thisObject:
		//		may be used to scope the call to callback
		//	description:
		//		This function corresponds to the JavaScript 1.6 Array.forEach() method, with one difference: when
		//		run over sparse arrays, this implementation passes the "holes" in the sparse array to
		//		the callback function with a value of undefined. JavaScript 1.6's forEach skips the holes in the sparse array.
		//		For more details, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/forEach
		//	example:
		//	| // log out all members of the array:
		//	| dojo.forEach(
		//	|		[ "thinger", "blah", "howdy", 10 ],
		//	|		function(item){
		//	|			console.log(item);
		//	|		}
		//	| );
		//	example:
		//	| // log out the members and their indexes
		//	| dojo.forEach(
		//	|		[ "thinger", "blah", "howdy", 10 ],
		//	|		function(item, idx, arr){
		//	|			console.log(item, "at index:", idx);
		//	|		}
		//	| );
		//	example:
		//	| // use a scoped object member as the callback
		//	|
		//	| var obj = {
		//	|		prefix: "logged via obj.callback:",
		//	|		callback: function(item){
		//	|			console.log(this.prefix, item);
		//	|		}
		//	| };
		//	|
		//	| // specifying the scope function executes the callback in that scope
		//	| dojo.forEach(
		//	|		[ "thinger", "blah", "howdy", 10 ],
		//	|		obj.callback,
		//	|		obj
		//	| );
		//	|
		//	| // alternately, we can accomplish the same thing with dojo.hitch()
		//	| dojo.forEach(
		//	|		[ "thinger", "blah", "howdy", 10 ],
		//	|		dojo.hitch(obj, "callback")
		//	| );
		//	arr: Array|String
		//	callback: Function|String
		//	thisObject: Object?
	};
	dojo.every = function(arr, callback, thisObject){
		// summary:
		//		Determines whether or not every item in arr satisfies the
		//		condition implemented by callback.
		// arr: Array|String
		//		the array to iterate on. If a string, operates on individual characters.
		// callback: Function|String
		//		a function is invoked with three arguments: item, index,
		//		and array and returns true if the condition is met.
		// thisObject: Object?
		//		may be used to scope the call to callback
		// returns: Boolean
		// description:
		//		This function corresponds to the JavaScript 1.6 Array.every() method, with one difference: when
		//		run over sparse arrays, this implementation passes the "holes" in the sparse array to
		//		the callback function with a value of undefined. JavaScript 1.6's every skips the holes in the sparse array.
		//		For more details, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/every
		// example:
		//	| // returns false
		//	| dojo.every([1, 2, 3, 4], function(item){ return item>1; });
		// example:
		//	| // returns true
		//	| dojo.every([1, 2, 3, 4], function(item){ return item>0; });
	};
	dojo.some = function(arr, callback, thisObject){
		// summary:
		//		Determines whether or not any item in arr satisfies the
		//		condition implemented by callback.
		// arr: Array|String
		//		the array to iterate over. If a string, operates on individual characters.
		// callback: Function|String
		//		a function is invoked with three arguments: item, index,
		//		and array and returns true if the condition is met.
		// thisObject: Object?
		//		may be used to scope the call to callback
		// returns: Boolean
		// description:
		//		This function corresponds to the JavaScript 1.6 Array.some() method, with one difference: when
		//		run over sparse arrays, this implementation passes the "holes" in the sparse array to
		//		the callback function with a value of undefined. JavaScript 1.6's some skips the holes in the sparse array.
		//		For more details, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/some
		// example:
		//	| // is true
		//	| dojo.some([1, 2, 3, 4], function(item){ return item>1; });
		// example:
		//	| // is false
		//	| dojo.some([1, 2, 3, 4], function(item){ return item<1; });
	};
	dojo.map = function(arr, callback, thisObject){
		// summary:
		//		applies callback to each element of arr and returns
		//		an Array with the results
		// arr: Array|String
		//		the array to iterate on. If a string, operates on
		//		individual characters.
		// callback: Function|String
		//		a function is invoked with three arguments, (item, index,
		//		array),	 and returns a value
		// thisObject: Object?
		//		may be used to scope the call to callback
		// returns: Array
		// description:
		//		This function corresponds to the JavaScript 1.6 Array.map() method, with one difference: when
		//		run over sparse arrays, this implementation passes the "holes" in the sparse array to
		//		the callback function with a value of undefined. JavaScript 1.6's map skips the holes in the sparse array.
		//		For more details, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/map
		// example:
		//	| // returns [2, 3, 4, 5]
		//	| dojo.map([1, 2, 3, 4], function(item){ return item+1 });
	};
	dojo.filter = function(arr, callback, thisObject){
		// summary:
		//		Returns a new Array with those items from arr that match the
		//		condition implemented by callback.
		// arr: Array
		//		the array to iterate over.
		// callback: Function|String
		//		a function that is invoked with three arguments (item,
		//		index, array). The return of this function is expected to
		//		be a boolean which determines whether the passed-in item
		//		will be included in the returned array.
		// thisObject: Object?
		//		may be used to scope the call to callback
		// returns: Array
		// description:
		//		This function corresponds to the JavaScript 1.6 Array.filter() method, with one difference: when
		//		run over sparse arrays, this implementation passes the "holes" in the sparse array to
		//		the callback function with a value of undefined. JavaScript 1.6's filter skips the holes in the sparse array.
		//		For more details, see:
		//			https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Objects/Array/filter
		// example:
		//	| // returns [2, 3, 4]
		//	| dojo.filter([1, 2, 3, 4], function(item){ return item>1; });
	};
	=====*/

	// our old simple function builder stuff
	var cache = {}, u, array; // the export object

	function clearCache(){
		cache = {};
	}

	function buildFn(fn){
		return cache[fn] = new Function("item", "index", "array", fn); // Function
	}
	// magic snippet: if(typeof fn == "string") fn = cache[fn] || buildFn(fn);

	// every & some

	function everyOrSome(some){
		var every = !some;
		return function(a, fn, o){
			var i = 0, l = a && a.length || 0, result;
			if(l && typeof a == "string") a = a.split("");
			if(typeof fn == "string") fn = cache[fn] || buildFn(fn);
			if(o){
				for(; i < l; ++i){
					result = !fn.call(o, a[i], i, a);
					if(some ^ result){
						return !result;
					}
				}
			}else{
				for(; i < l; ++i){
					result = !fn(a[i], i, a);
					if(some ^ result){
						return !result;
					}
				}
			}
			return every; // Boolean
		}
	}
	// var every = everyOrSome(false), some = everyOrSome(true);

	// indexOf, lastIndexOf

	function index(up){
		var delta = 1, lOver = 0, uOver = 0;
		if(!up){
			delta = lOver = uOver = -1;
		}
		return function(a, x, from, last){
			if(last && delta > 0){
				// TODO: why do we use a non-standard signature? why do we need "last"?
				return array.lastIndexOf(a, x, from);
			}
			var l = a && a.length || 0, end = up ? l + uOver : lOver, i;
			if(from === u){
				i = up ? lOver : l + uOver;
			}else{
				if(from < 0){
					i = l + from;
					if(i < 0){
						i = lOver;
					}
				}else{
					i = from >= l ? l + uOver : from;
				}
			}
			if(l && typeof a == "string") a = a.split("");
			for(; i != end; i += delta){
				if(a[i] == x){
					return i; // Number
				}
			}
			return -1; // Number
		}
	}
	// var indexOf = index(true), lastIndexOf = index(false);

	function forEach(a, fn, o){
		var i = 0, l = a && a.length || 0;
		if(l && typeof a == "string") a = a.split("");
		if(typeof fn == "string") fn = cache[fn] || buildFn(fn);
		if(o){
			for(; i < l; ++i){
				fn.call(o, a[i], i, a);
			}
		}else{
			for(; i < l; ++i){
				fn(a[i], i, a);
			}
		}
	}

	function map(a, fn, o, Ctr){
		// TODO: why do we have a non-standard signature here? do we need "Ctr"?
		var i = 0, l = a && a.length || 0, out = new (Ctr || Array)(l);
		if(l && typeof a == "string") a = a.split("");
		if(typeof fn == "string") fn = cache[fn] || buildFn(fn);
		if(o){
			for(; i < l; ++i){
				out[i] = fn.call(o, a[i], i, a);
			}
		}else{
			for(; i < l; ++i){
				out[i] = fn(a[i], i, a);
			}
		}
		return out; // Array
	}

	function filter(a, fn, o){
		// TODO: do we need "Ctr" here like in map()?
		var i = 0, l = a && a.length || 0, out = [], value;
		if(l && typeof a == "string") a = a.split("");
		if(typeof fn == "string") fn = cache[fn] || buildFn(fn);
		if(o){
			for(; i < l; ++i){
				value = a[i];
				if(fn.call(o, value, i, a)){
					out.push(value);
				}
			}
		}else{
			for(; i < l; ++i){
				value = a[i];
				if(fn(value, i, a)){
					out.push(value);
				}
			}
		}
		return out; // Array
	}

	array = {
		every:       everyOrSome(false),
		some:        everyOrSome(true),
		indexOf:     index(true),
		lastIndexOf: index(false),
		forEach:     forEach,
		map:         map,
		filter:      filter,
		clearCache:  clearCache
	};

	1 && lang.mixin(dojo, array);

	/*===== return dojo.array; =====*/
	return array;
});

},
'dojo/_base/Deferred':function(){
define("dojo/_base/Deferred", ["./kernel", "./lang"], function(dojo, lang){
	// module:
	//		dojo/_base/Deferred
	// summary:
	//		This module defines dojo.Deferred.

	var mutator = function(){};
	var freeze = Object.freeze || function(){};
	// A deferred provides an API for creating and resolving a promise.
	dojo.Deferred = function(/*Function?*/ canceller){
		// summary:
		//		Deferreds provide a generic means for encapsulating an asynchronous
		//		operation and notifying users of the completion and result of the operation.
		// description:
		//		The dojo.Deferred API is based on the concept of promises that provide a
		//		generic interface into the eventual completion of an asynchronous action.
		//		The motivation for promises fundamentally is about creating a
		//		separation of concerns that allows one to achieve the same type of
		//		call patterns and logical data flow in asynchronous code as can be
		//		achieved in synchronous code. Promises allows one
		//		to be able to call a function purely with arguments needed for
		//		execution, without conflating the call with concerns of whether it is
		//		sync or async. One shouldn't need to alter a call's arguments if the
		//		implementation switches from sync to async (or vice versa). By having
		//		async functions return promises, the concerns of making the call are
		//		separated from the concerns of asynchronous interaction (which are
		//		handled by the promise).
		//
		//		The dojo.Deferred is a type of promise that provides methods for fulfilling the
		//		promise with a successful result or an error. The most important method for
		//		working with Dojo's promises is the then() method, which follows the
		//		CommonJS proposed promise API. An example of using a Dojo promise:
		//
		//		|	var resultingPromise = someAsyncOperation.then(function(result){
		//		|		... handle result ...
		//		|	},
		//		|	function(error){
		//		|		... handle error ...
		//		|	});
		//
		//		The .then() call returns a new promise that represents the result of the
		//		execution of the callback. The callbacks will never affect the original promises value.
		//
		//		The dojo.Deferred instances also provide the following functions for backwards compatibility:
		//
		//			* addCallback(handler)
		//			* addErrback(handler)
		//			* callback(result)
		//			* errback(result)
		//
		//		Callbacks are allowed to return promises themselves, so
		//		you can build complicated sequences of events with ease.
		//
		//		The creator of the Deferred may specify a canceller.  The canceller
		//		is a function that will be called if Deferred.cancel is called
		//		before the Deferred fires. You can use this to implement clean
		//		aborting of an XMLHttpRequest, etc. Note that cancel will fire the
		//		deferred with a CancelledError (unless your canceller returns
		//		another kind of error), so the errbacks should be prepared to
		//		handle that error for cancellable Deferreds.
		// example:
		//	|	var deferred = new dojo.Deferred();
		//	|	setTimeout(function(){ deferred.callback({success: true}); }, 1000);
		//	|	return deferred;
		// example:
		//		Deferred objects are often used when making code asynchronous. It
		//		may be easiest to write functions in a synchronous manner and then
		//		split code using a deferred to trigger a response to a long-lived
		//		operation. For example, instead of register a callback function to
		//		denote when a rendering operation completes, the function can
		//		simply return a deferred:
		//
		//		|	// callback style:
		//		|	function renderLotsOfData(data, callback){
		//		|		var success = false
		//		|		try{
		//		|			for(var x in data){
		//		|				renderDataitem(data[x]);
		//		|			}
		//		|			success = true;
		//		|		}catch(e){ }
		//		|		if(callback){
		//		|			callback(success);
		//		|		}
		//		|	}
		//
		//		|	// using callback style
		//		|	renderLotsOfData(someDataObj, function(success){
		//		|		// handles success or failure
		//		|		if(!success){
		//		|			promptUserToRecover();
		//		|		}
		//		|	});
		//		|	// NOTE: no way to add another callback here!!
		// example:
		//		Using a Deferred doesn't simplify the sending code any, but it
		//		provides a standard interface for callers and senders alike,
		//		providing both with a simple way to service multiple callbacks for
		//		an operation and freeing both sides from worrying about details
		//		such as "did this get called already?". With Deferreds, new
		//		callbacks can be added at any time.
		//
		//		|	// Deferred style:
		//		|	function renderLotsOfData(data){
		//		|		var d = new dojo.Deferred();
		//		|		try{
		//		|			for(var x in data){
		//		|				renderDataitem(data[x]);
		//		|			}
		//		|			d.callback(true);
		//		|		}catch(e){
		//		|			d.errback(new Error("rendering failed"));
		//		|		}
		//		|		return d;
		//		|	}
		//
		//		|	// using Deferred style
		//		|	renderLotsOfData(someDataObj).then(null, function(){
		//		|		promptUserToRecover();
		//		|	});
		//		|	// NOTE: addErrback and addCallback both return the Deferred
		//		|	// again, so we could chain adding callbacks or save the
		//		|	// deferred for later should we need to be notified again.
		// example:
		//		In this example, renderLotsOfData is synchronous and so both
		//		versions are pretty artificial. Putting the data display on a
		//		timeout helps show why Deferreds rock:
		//
		//		|	// Deferred style and async func
		//		|	function renderLotsOfData(data){
		//		|		var d = new dojo.Deferred();
		//		|		setTimeout(function(){
		//		|			try{
		//		|				for(var x in data){
		//		|					renderDataitem(data[x]);
		//		|				}
		//		|				d.callback(true);
		//		|			}catch(e){
		//		|				d.errback(new Error("rendering failed"));
		//		|			}
		//		|		}, 100);
		//		|		return d;
		//		|	}
		//
		//		|	// using Deferred style
		//		|	renderLotsOfData(someDataObj).then(null, function(){
		//		|		promptUserToRecover();
		//		|	});
		//
		//		Note that the caller doesn't have to change his code at all to
		//		handle the asynchronous case.

		var result, finished, isError, head, nextListener;
		var promise = (this.promise = {});

		function complete(value){
			if(finished){
				throw new Error("This deferred has already been resolved");
			}
			result = value;
			finished = true;
			notify();
		}
		function notify(){
			var mutated;
			while(!mutated && nextListener){
				var listener = nextListener;
				nextListener = nextListener.next;
				if((mutated = (listener.progress == mutator))){ // assignment and check
					finished = false;
				}
				var func = (isError ? listener.error : listener.resolved);
				if(func){
					try{
						var newResult = func(result);
						if (newResult && typeof newResult.then === "function"){
							newResult.then(lang.hitch(listener.deferred, "resolve"), lang.hitch(listener.deferred, "reject"), lang.hitch(listener.deferred, "progress"));
							continue;
						}
						var unchanged = mutated && newResult === undefined;
						if(mutated && !unchanged){
							isError = newResult instanceof Error;
						}
						listener.deferred[unchanged && isError ? "reject" : "resolve"](unchanged ? result : newResult);
					}catch(e){
						listener.deferred.reject(e);
					}
				}else{
					if(isError){
						listener.deferred.reject(result);
					}else{
						listener.deferred.resolve(result);
					}
				}
			}
		}
		// calling resolve will resolve the promise
		this.resolve = this.callback = function(value){
			// summary:
			//		Fulfills the Deferred instance successfully with the provide value
			this.fired = 0;
			this.results = [value, null];
			complete(value);
		};


		// calling error will indicate that the promise failed
		this.reject = this.errback = function(error){
			// summary:
			//		Fulfills the Deferred instance as an error with the provided error
			isError = true;
			this.fired = 1;
			complete(error);
			this.results = [null, error];
			if(!error || error.log !== false){
				(dojo.config.deferredOnError || function(x){ console.error(x); })(error);
			}
		};
		// call progress to provide updates on the progress on the completion of the promise
		this.progress = function(update){
			// summary:
			//		Send progress events to all listeners
			var listener = nextListener;
			while(listener){
				var progress = listener.progress;
				progress && progress(update);
				listener = listener.next;
			}
		};
		this.addCallbacks = function(callback, errback){
			// summary:
			//		Adds callback and error callback for this deferred instance.
			// callback: Function?
			// 		The callback attached to this deferred object.
			// errback: Function?
			// 		The error callback attached to this deferred object.
			// returns:
			// 		Returns this deferred object.
			this.then(callback, errback, mutator);
			return this;	// dojo.Deferred
		};
		// provide the implementation of the promise
		promise.then = this.then = function(/*Function?*/resolvedCallback, /*Function?*/errorCallback, /*Function?*/progressCallback){
			// summary:
			//		Adds a fulfilledHandler, errorHandler, and progressHandler to be called for
			//		completion of a promise. The fulfilledHandler is called when the promise
			//		is fulfilled. The errorHandler is called when a promise fails. The
			//		progressHandler is called for progress events. All arguments are optional
			//		and non-function values are ignored. The progressHandler is not only an
			//		optional argument, but progress events are purely optional. Promise
			//		providers are not required to ever create progress events.
			//
			//		This function will return a new promise that is fulfilled when the given
			//		fulfilledHandler or errorHandler callback is finished. This allows promise
			//		operations to be chained together. The value returned from the callback
			//		handler is the fulfillment value for the returned promise. If the callback
			//		throws an error, the returned promise will be moved to failed state.
			//
			// returns: 
			//		Returns a new promise that represents the result of the
			//		execution of the callback. The callbacks will never affect the original promises value.
			// example:
			//		An example of using a CommonJS compliant promise:
			//		|	asyncComputeTheAnswerToEverything().
			//		|		then(addTwo).
			//		|		then(printResult, onError);
			//		|	>44
			//
			var returnDeferred = progressCallback == mutator ? this : new dojo.Deferred(promise.cancel);
			var listener = {
				resolved: resolvedCallback,
				error: errorCallback,
				progress: progressCallback,
				deferred: returnDeferred
			};
			if(nextListener){
				head = head.next = listener;
			}
			else{
				nextListener = head = listener;
			}
			if(finished){
				notify();
			}
			return returnDeferred.promise; // Promise
		};
		var deferred = this;
		promise.cancel = this.cancel = function (){
			// summary:
			//		Cancels the asynchronous operation
			if(!finished){
				var error = canceller && canceller(deferred);
				if(!finished){
					if (!(error instanceof Error)){
						error = new Error(error);
					}
					error.log = false;
					deferred.reject(error);
				}
			}
		};
		freeze(promise);
	};
	lang.extend(dojo.Deferred, {
		addCallback: function (/*Function*/ callback){
			// summary:
			// 		Adds successful callback for this deferred instance.
			// returns:
			// 		Returns this deferred object.
			return this.addCallbacks(lang.hitch.apply(dojo, arguments));	// dojo.Deferred
		},

		addErrback: function (/*Function*/ errback){
			// summary:
			// 		Adds error callback for this deferred instance.
			// returns:
			// 		Returns this deferred object.
			return this.addCallbacks(null, lang.hitch.apply(dojo, arguments));	// dojo.Deferred
		},

		addBoth: function (/*Function*/ callback){
			// summary:
			// 		Add handler as both successful callback and error callback for this deferred instance.
			// returns:
			// 		Returns this deferred object.
			var enclosed = lang.hitch.apply(dojo, arguments);
			return this.addCallbacks(enclosed, enclosed);	// dojo.Deferred
		},
		fired: -1
	});

	dojo.Deferred.when = dojo.when = function(promiseOrValue, /*Function?*/ callback, /*Function?*/ errback, /*Function?*/ progressHandler){
		// summary:
		//		This provides normalization between normal synchronous values and
		//		asynchronous promises, so you can interact with them in a common way
		// returns:
		// 		Returns a new promise that represents the result of the execution of callback 
		// 		when parameter "promiseOrValue" is promise.
		// 		Returns the execution result of callback when parameter "promiseOrValue" is value.
		// example:
		//		|	function printFirstAndLast(items){
		//		|		dojo.when(findFirst(items), console.log);
		//		|		dojo.when(findLast(items), console.log);
		//		|	}
		//		|	function findFirst(items){
		//		|		return dojo.when(items, function(items){
		//		|			return items[0];
		//		|		});
		//		|	}
		//		|	function findLast(items){
		//		|		return dojo.when(items, function(items){
		//		|			return items[items.length - 1];
		//		|		});
		//		|	}
		//		And now all three of his functions can be used sync or async.
		//		|	printFirstAndLast([1,2,3,4]) will work just as well as
		//		|	printFirstAndLast(dojo.xhrGet(...));

		if(promiseOrValue && typeof promiseOrValue.then === "function"){
			return promiseOrValue.then(callback, errback, progressHandler);
		}
		return callback ? callback(promiseOrValue) : promiseOrValue;	// Promise
	};

	return dojo.Deferred;
});

},
'dojox/charting/plot2d/_PlotEvents':function(){
define("dojox/charting/plot2d/_PlotEvents", ["dojo/_base/lang", "dojo/_base/array", "dojo/_base/declare", "dojo/_base/connect"], 
	function(lang, arr, declare, hub){

	return declare("dojox.charting.plot2d._PlotEvents", null, {
		constructor: function(){
			this._shapeEvents = [];
			this._eventSeries = {};
		},
		destroy: function(){
			//	summary:
			//		Destroy any internal elements and event handlers.
			this.resetEvents();
			this.inherited(arguments);
		},
		plotEvent: function(o){
			//	summary:
			//		Stub function for use by specific plots.
			//	o: Object
			//		An object intended to represent event parameters.
		},
		raiseEvent: function(o){
			//	summary:
			//		Raises events in predefined order
			//	o: Object
			//		An object intended to represent event parameters.
			this.plotEvent(o);
			var t = lang.delegate(o);
			t.originalEvent = o.type;
			t.originalPlot  = o.plot;
			t.type = "onindirect";
			arr.forEach(this.chart.stack, function(plot){
				if(plot !== this && plot.plotEvent){
					t.plot = plot;
					plot.plotEvent(t);
				}
			}, this);
		},
		connect: function(object, method){
			//	summary:
			//		Helper function to connect any object's method to our plotEvent.
			//	object: Object
			//		The object to connect to.
			//	method: String|Function
			//		The method to fire when our plotEvent is fired.
			//	returns: Array
			//		The handle as returned from dojo.connect (see dojo.connect).
			this.dirty = true;
			return hub.connect(this, "plotEvent", object, method);	//	Array
		},
		events: function(){
			//	summary:
			//		Find out if any event handlers have been connected to our plotEvent.
			//	returns: Boolean
			//		A flag indicating that there are handlers attached.
			return !!this.plotEvent.after;
		},
		resetEvents: function(){
			//	summary:
			//		Reset all events attached to our plotEvent (i.e. disconnect).
			if(this._shapeEvents.length){
				arr.forEach(this._shapeEvents, function(item){
					item.shape.disconnect(item.handle);
				});
				this._shapeEvents = [];
			}
			this.raiseEvent({type: "onplotreset", plot: this});
		},
		_connectSingleEvent: function(o, eventName){
			this._shapeEvents.push({
				shape:  o.eventMask,
				handle: o.eventMask.connect(eventName, this, function(e){
					o.type  = eventName;
					o.event = e;
					this.raiseEvent(o);
					o.event = null;
				})
			});
		},
		_connectEvents: function(o){
			if(o){
				o.chart = this.chart;
				o.plot  = this;
				o.hAxis = this.hAxis || null;
				o.vAxis = this.vAxis || null;
				o.eventMask = o.eventMask || o.shape;
				this._connectSingleEvent(o, "onmouseover");
				this._connectSingleEvent(o, "onmouseout");
				this._connectSingleEvent(o, "onclick");
			}
		},
		_reconnectEvents: function(seriesName){
			var a = this._eventSeries[seriesName];
			if(a){
				arr.forEach(a, this._connectEvents, this);
			}
		},
		fireEvent: function(seriesName, eventName, index, eventObject){
			//	summary:
			//		Emulates firing an event for a given data value (specified by
			//		an index) of a given series.
			//	seriesName: String:
			//		Series name.
			//	eventName: String:
			//		Event name to emulate.
			//	index:	Number:
			//		Valid data value index used to raise an event.
			//	eventObject: Object?:
			//		Optional event object. Especially useful for synthetic events.
			//		Default: null.
			var s = this._eventSeries[seriesName];
			if(s && s.length && index < s.length){
				var o = s[index];
				o.type  = eventName;
				o.event = eventObject || null;
				this.raiseEvent(o);
				o.event = null;
			}
		}
	});
});

},
'dojo/dom':function(){
define(["./_base/sniff", "./_base/lang", "./_base/window"],
		function(has, lang, win){
	// module:
	//		dojo/dom
	// summary:
	//		This module defines the core dojo DOM API.

	// FIXME: need to add unit tests for all the semi-public methods

		try{
		document.execCommand("BackgroundImageCache", false, true);
	}catch(e){
		// sane browsers don't have cache "issues"
	}
	
	// =============================
	// DOM Functions
	// =============================

	/*=====
	dojo.byId = function(id, doc){
		// summary:
		//		Returns DOM node with matching `id` attribute or `null`
		//		if not found. If `id` is a DomNode, this function is a no-op.
		//
		// id: String|DOMNode
		//	 	A string to match an HTML id attribute or a reference to a DOM Node
		//
		// doc: Document?
		//		Document to work in. Defaults to the current value of
		//		dojo.doc.  Can be used to retrieve
		//		node references from other documents.
		//
		// example:
		//		Look up a node by ID:
		//	|	var n = dojo.byId("foo");
		//
		// example:
		//		Check if a node exists, and use it.
		//	|	var n = dojo.byId("bar");
		//	|	if(n){ doStuff() ... }
		//
		// example:
		//		Allow string or DomNode references to be passed to a custom function:
		//	|	var foo = function(nodeOrId){
		//	|		nodeOrId = dojo.byId(nodeOrId);
		//	|		// ... more stuff
		//	|	}
	=====*/

	/*=====
	dojo.isDescendant = function(node, ancestor){
		// summary:
		//		Returns true if node is a descendant of ancestor
		// node: DOMNode|String
		//		string id or node reference to test
		// ancestor: DOMNode|String
		//		string id or node reference of potential parent to test against
		//
		// example:
		//		Test is node id="bar" is a descendant of node id="foo"
		//	|	if(dojo.isDescendant("bar", "foo")){ ... }
	};
	=====*/

	// TODO: do we need this function in the base?

	/*=====
	dojo.setSelectable = function(node, selectable){
		// summary:
		//		Enable or disable selection on a node
		// node: DOMNode|String
		//		id or reference to node
		// selectable: Boolean
		//		state to put the node in. false indicates unselectable, true
		//		allows selection.
		// example:
		//		Make the node id="bar" unselectable
		//	|	dojo.setSelectable("bar");
		// example:
		//		Make the node id="bar" selectable
		//	|	dojo.setSelectable("bar", true);
	};
	=====*/

	var dom = {};   // the result object

		if(has("ie")){
		dom.byId = function(id, doc){
			if(typeof id != "string"){
				return id;
			}
			var _d = doc || win.doc, te = id && _d.getElementById(id);
			// attributes.id.value is better than just id in case the
			// user has a name=id inside a form
			if(te && (te.attributes.id.value == id || te.id == id)){
				return te;
			}else{
				var eles = _d.all[id];
				if(!eles || eles.nodeName){
					eles = [eles];
				}
				// if more than 1, choose first with the correct id
				var i = 0;
				while((te = eles[i++])){
					if((te.attributes && te.attributes.id && te.attributes.id.value == id) || te.id == id){
						return te;
					}
				}
			}
		};
	}else{
			dom.byId = function(id, doc){
			// inline'd type check.
			// be sure to return null per documentation, to match IE branch.
			return ((typeof id == "string") ? (doc || win.doc).getElementById(id) : id) || null; // DOMNode
		};
		}
		/*=====
	};
	=====*/

	dom.isDescendant = function(/*DOMNode|String*/node, /*DOMNode|String*/ancestor){
		try{
			node = dom.byId(node);
			ancestor = dom.byId(ancestor);
			while(node){
				if(node == ancestor){
					return true; // Boolean
				}
				node = node.parentNode;
			}
		}catch(e){ /* squelch, return false */ }
		return false; // Boolean
	};

	// TODO: do we need this function in the base?

	dom.setSelectable = function(/*DOMNode|String*/node, /*Boolean*/selectable){
		node = dom.byId(node);
				if(has("mozilla")){
			node.style.MozUserSelect = selectable ? "" : "none";
		}else if(has("khtml") || has("webkit")){
					node.style.KhtmlUserSelect = selectable ? "auto" : "none";
				}else if(has("ie")){
			var v = (node.unselectable = selectable ? "" : "on"),
				cs = node.getElementsByTagName("*"), i = 0, l = cs.length;
			for(; i < l; ++i){
				cs.item(i).unselectable = v;
			}
		}
				//FIXME: else?  Opera?
	};

	return dom;
});

},
'dojo/dom-style':function(){
define(["./_base/sniff", "./dom"], function(has, dom){
	// module:
	//		dojo/dom-style
	// summary:
	//		This module defines the core dojo DOM style API.

	// =============================
	// Style Functions
	// =============================

	// getComputedStyle drives most of the style code.
	// Wherever possible, reuse the returned object.
	//
	// API functions below that need to access computed styles accept an
	// optional computedStyle parameter.
	// If this parameter is omitted, the functions will call getComputedStyle themselves.
	// This way, calling code can access computedStyle once, and then pass the reference to
	// multiple API functions.

	/*=====
	dojo.getComputedStyle = function(node){
		// summary:
		//		Returns a "computed style" object.
		//
		// description:
		//		Gets a "computed style" object which can be used to gather
		//		information about the current state of the rendered node.
		//
		//		Note that this may behave differently on different browsers.
		//		Values may have different formats and value encodings across
		//		browsers.
		//
		//		Note also that this method is expensive.  Wherever possible,
		//		reuse the returned object.
		//
		//		Use the dojo.style() method for more consistent (pixelized)
		//		return values.
		//
		// node: DOMNode
		//		A reference to a DOM node. Does NOT support taking an
		//		ID string for speed reasons.
		// example:
		//	|	dojo.getComputedStyle(dojo.byId('foo')).borderWidth;
		//
		// example:
		//		Reusing the returned object, avoiding multiple lookups:
		//	|	var cs = dojo.getComputedStyle(dojo.byId("someNode"));
		//	|	var w = cs.width, h = cs.height;
		return; // CSS2Properties
	}
	=====*/

	/*=====
	dojo.toPixelValue = function(node, value){
		// summary:
		//      converts style value to pixels on IE or return a numeric value.
		// node: DOMNode
		// value: String
		// returns: Number
	};
	=====*/

	/*=====
	dojo._toPixelValue = function(node, value){
		// summary:
		//		Existing alias for `dojo._toPixelValue`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.getStyle = function(node, name){
		// summary:
		//		Accesses styles on a node.
		// description:
		//		Getting the style value uses the computed style for the node, so the value
		//		will be a calculated value, not just the immediate node.style value.
		//		Also when getting values, use specific style names,
		//		like "borderBottomWidth" instead of "border" since compound values like
		//		"border" are not necessarily reflected as expected.
		//		If you want to get node dimensions, use `dojo.marginBox()`,
		//		`dojo.contentBox()` or `dojo.position()`.
		// node: DOMNode|String
		//		id or reference to node to get style for
		// name: String?
		//		the style property to get
		// example:
		//		Passing only an ID or node returns the computed style object of
		//		the node:
		//	|	dojo.getStyle("thinger");
		// example:
		//		Passing a node and a style property returns the current
		//		normalized, computed value for that property:
		//	|	dojo.getStyle("thinger", "opacity"); // 1 by default
	};
	=====*/

	/*=====
	dojo.setStyle = function(node, name, value){
		// summary:
		//		Sets styles on a node.
		// node: DOMNode|String
		//		id or reference to node to set style for
		// name: String|Object
		//		the style property to set in DOM-accessor format
		//		("borderWidth", not "border-width") or an object with key/value
		//		pairs suitable for setting each property.
		// value: String?
		//		If passed, sets value on the node for style, handling
		//		cross-browser concerns.  When setting a pixel value,
		//		be sure to include "px" in the value. For instance, top: "200px".
		//		Otherwise, in some cases, some browsers will not apply the style.
		//
		// example:
		//		Passing a node, a style property, and a value changes the
		//		current display of the node and returns the new computed value
		//	|	dojo.setStyle("thinger", "opacity", 0.5); // == 0.5
		//
		// example:
		//		Passing a node, an object-style style property sets each of the values in turn and returns the computed style object of the node:
		//	|	dojo.setStyle("thinger", {
		//	|		"opacity": 0.5,
		//	|		"border": "3px solid black",
		//	|		"height": "300px"
		//	|	});
		//
		// example:
		//		When the CSS style property is hyphenated, the JavaScript property is camelCased.
		//		font-size becomes fontSize, and so on.
		//	|	dojo.setStyle("thinger",{
		//	|		fontSize:"14pt",
		//	|		letterSpacing:"1.2em"
		//	|	});
		//
		// example:
		//		dojo.NodeList implements .style() using the same syntax, omitting the "node" parameter, calling
		//		dojo.style() on every element of the list. See: `dojo.query()` and `dojo.NodeList()`
		//	|	dojo.query(".someClassName").style("visibility","hidden");
		//	|	// or
		//	|	dojo.query("#baz > div").style({
		//	|		opacity:0.75,
		//	|		fontSize:"13pt"
		//	|	});
	};
	=====*/

	// Although we normally eschew argument validation at this
	// level, here we test argument 'node' for (duck)type,
	// by testing nodeType, ecause 'document' is the 'parentNode' of 'body'
	// it is frequently sent to this function even
	// though it is not Element.
	var getComputedStyle, style = {};
		if(has("webkit")){
			getComputedStyle = function(/*DomNode*/node){
			var s;
			if(node.nodeType == 1){
				var dv = node.ownerDocument.defaultView;
				s = dv.getComputedStyle(node, null);
				if(!s && node.style){
					node.style.display = "";
					s = dv.getComputedStyle(node, null);
				}
			}
			return s || {};
		};
		}else if(has("ie") && (has("ie") < 9 || has("quirks"))){
		getComputedStyle = function(node){
			// IE (as of 7) doesn't expose Element like sane browsers
			return node.nodeType == 1 /* ELEMENT_NODE*/ ? node.currentStyle : {};
		};
	}else{
		getComputedStyle = function(node){
			return node.nodeType == 1 ?
				node.ownerDocument.defaultView.getComputedStyle(node, null) : {};
		};
	}
		style.getComputedStyle = getComputedStyle;

	var toPixel;
		if(!has("ie")){
			toPixel = function(element, value){
			// style values can be floats, client code may want
			// to round for integer pixels.
			return parseFloat(value) || 0;
		};
		}else{
		toPixel = function(element, avalue){
			if(!avalue){ return 0; }
			// on IE7, medium is usually 4 pixels
			if(avalue == "medium"){ return 4; }
			// style values can be floats, client code may
			// want to round this value for integer pixels.
			if(avalue.slice && avalue.slice(-2) == 'px'){ return parseFloat(avalue); }
			var s = element.style, rs = element.runtimeStyle, cs = element.currentStyle,
				sLeft = s.left, rsLeft = rs.left;
			rs.left = cs.left;
			try{
				// 'avalue' may be incompatible with style.left, which can cause IE to throw
				// this has been observed for border widths using "thin", "medium", "thick" constants
				// those particular constants could be trapped by a lookup
				// but perhaps there are more
				s.left = avalue;
				avalue = s.pixelLeft;
			}catch(e){
				avalue = 0;
			}
			s.left = sLeft;
			rs.left = rsLeft;
			return avalue;
		}
	}
		style.toPixelValue = toPixel;

	// FIXME: there opacity quirks on FF that we haven't ported over. Hrm.

		var astr = "DXImageTransform.Microsoft.Alpha";
	var af = function(n, f){
		try{
			return n.filters.item(astr);
		}catch(e){
			return f ? {} : null;
		}
	};

		var _getOpacity =
			has("ie") < 9 || (has("ie") && has("quirks")) ? function(node){
			try{
				return af(node).Opacity / 100; // Number
			}catch(e){
				return 1; // Number
			}
		} :
			function(node){
			return getComputedStyle(node).opacity;
		};

	var _setOpacity =
				has("ie") < 9 || (has("ie") && has("quirks")) ? function(/*DomNode*/node, /*Number*/opacity){
			var ov = opacity * 100, opaque = opacity == 1;
			node.style.zoom = opaque ? "" : 1;

			if(!af(node)){
				if(opaque){
					return opacity;
				}
				node.style.filter += " progid:" + astr + "(Opacity=" + ov + ")";
			}else{
				af(node, 1).Opacity = ov;
			}

			// on IE7 Alpha(Filter opacity=100) makes text look fuzzy so disable it altogether (bug #2661),
			//but still update the opacity value so we can get a correct reading if it is read later.
			af(node, 1).Enabled = !opaque;

			if(node.tagName.toLowerCase() == "tr"){
				for(var td = node.firstChild; td; td = td.nextSibling){
					if(td.tagName.toLowerCase() == "td"){
						_setOpacity(td, opacity);
					}
				}
			}
			return opacity;
		} :
				function(node, opacity){
			return node.style.opacity = opacity;
		};

	var _pixelNamesCache = {
		left: true, top: true
	};
	var _pixelRegExp = /margin|padding|width|height|max|min|offset/; // |border
	function _toStyleValue(node, type, value){
		//TODO: should we really be doing string case conversion here? Should we cache it? Need to profile!
		type = type.toLowerCase();
				if(has("ie")){
			if(value == "auto"){
				if(type == "height"){ return node.offsetHeight; }
				if(type == "width"){ return node.offsetWidth; }
			}
			if(type == "fontweight"){
				switch(value){
					case 700: return "bold";
					case 400:
					default: return "normal";
				}
			}
		}
				if(!(type in _pixelNamesCache)){
			_pixelNamesCache[type] = _pixelRegExp.test(type);
		}
		return _pixelNamesCache[type] ? toPixel(node, value) : value;
	}

	var _floatStyle = has("ie") ? "styleFloat" : "cssFloat",
		_floatAliases = {"cssFloat": _floatStyle, "styleFloat": _floatStyle, "float": _floatStyle};

	// public API

	style.get = function getStyle(/*DOMNode|String*/ node, /*String?*/ name){
		var n = dom.byId(node), l = arguments.length, op = (name == "opacity");
		if(l == 2 && op){
			return _getOpacity(n);
		}
		name = _floatAliases[name] || name;
		var s = style.getComputedStyle(n);
		return (l == 1) ? s : _toStyleValue(n, name, s[name] || n.style[name]); /* CSS2Properties||String||Number */
	};

	style.set = function setStyle(/*DOMNode|String*/ node, /*String|Object*/ name, /*String?*/ value){
		var n = dom.byId(node), l = arguments.length, op = (name == "opacity");
		name = _floatAliases[name] || name;
		if(l == 3){
			return op ? _setOpacity(n, value) : n.style[name] = value; // Number
		}
		for(var x in name){
			style.set(node, x, name[x]);
		}
		return style.getComputedStyle(n);
	};

	return style;
});

},
'dojox/charting/axis2d/Invisible':function(){
define("dojox/charting/axis2d/Invisible", ["dojo/_base/lang", "dojo/_base/declare", "./Base", "../scaler/linear", 
	"dojox/gfx", "dojox/lang/utils", "dojox/lang/functional", "dojo/string"],
	function(lang, declare, Base, lin, g, du, df, dstring){
/*=====
var Base = dojox.charting.axis2d.Base;
=====*/ 
	var merge = du.merge,
		labelGap = 4,			// in pixels
		centerAnchorLimit = 45;	// in degrees

	return declare("dojox.charting.axis2d.Invisible", Base, {
		//	summary:
		//		The default axis object used in dojox.charting.  See dojox.charting.Chart.addAxis for details.
		//
		//	defaultParams: Object
		//		The default parameters used to define any axis.
		//	optionalParams: Object
		//		Any optional parameters needed to define an axis.

		/*
		//	TODO: the documentation tools need these to be pre-defined in order to pick them up
		//	correctly, but the code here is partially predicated on whether or not the properties
		//	actually exist.  For now, we will leave these undocumented but in the code for later. -- TRT

		//	opt: Object
		//		The actual options used to define this axis, created at initialization.
		//	scalar: Object
		//		The calculated helper object to tell charts how to draw an axis and any data.
		//	ticks: Object
		//		The calculated tick object that helps a chart draw the scaling on an axis.
		//	dirty: Boolean
		//		The state of the axis (whether it needs to be redrawn or not)
		//	scale: Number
		//		The current scale of the axis.
		//	offset: Number
		//		The current offset of the axis.

		opt: null,
		scalar: null,
		ticks: null,
		dirty: true,
		scale: 1,
		offset: 0,
		*/
		defaultParams: {
			vertical:    false,		// true for vertical axis
			fixUpper:    "none",	// align the upper on ticks: "major", "minor", "micro", "none"
			fixLower:    "none",	// align the lower on ticks: "major", "minor", "micro", "none"
			natural:     false,		// all tick marks should be made on natural numbers
			leftBottom:  true,		// position of the axis, used with "vertical"
			includeZero: false,		// 0 should be included
			fixed:       true,		// all labels are fixed numbers
			majorLabels: true,		// draw major labels
			minorTicks:  true,		// draw minor ticks
			minorLabels: true,		// draw minor labels
			microTicks:  false,		// draw micro ticks
			rotation:    0			// label rotation angle in degrees
		},
		optionalParams: {
			min:			0,	// minimal value on this axis
			max:			1,	// maximal value on this axis
			from:			0,	// visible from this value
			to:				1,	// visible to this value
			majorTickStep:	4,	// major tick step
			minorTickStep:	2,	// minor tick step
			microTickStep:	1,	// micro tick step
			labels:			[],	// array of labels for major ticks
								// with corresponding numeric values
								// ordered by values
			labelFunc:		null, // function to compute label values
			maxLabelSize:	0,	// size in px. For use with labelFunc
			maxLabelCharCount:	0,	// size in word count.
			trailingSymbol:			null

			// TODO: add support for minRange!
			// minRange:		1,	// smallest distance from min allowed on the axis
		},

		constructor: function(chart, kwArgs){
			//	summary:
			//		The constructor for an axis.
			//	chart: dojox.charting.Chart
			//		The chart the axis belongs to.
			//	kwArgs: dojox.charting.axis2d.__AxisCtorArgs?
			//		Any optional keyword arguments to be used to define this axis.
			this.opt = lang.clone(this.defaultParams);
            du.updateWithObject(this.opt, kwArgs);
			du.updateWithPattern(this.opt, kwArgs, this.optionalParams);
		},
		dependOnData: function(){
			//	summary:
			//		Find out whether or not the axis options depend on the data in the axis.
			return !("min" in this.opt) || !("max" in this.opt);	//	Boolean
		},
		clear: function(){
			//	summary:
			//		Clear out all calculated properties on this axis;
			//	returns: dojox.charting.axis2d.Default
			//		The reference to the axis for functional chaining.
			delete this.scaler;
			delete this.ticks;
			this.dirty = true;
			return this;	//	dojox.charting.axis2d.Default
		},
		initialized: function(){
			//	summary:
			//		Finds out if this axis has been initialized or not.
			//	returns: Boolean
			//		Whether a scaler has been calculated and if the axis is not dirty.
			return "scaler" in this && !(this.dirty && this.dependOnData());
		},
		setWindow: function(scale, offset){
			//	summary:
			//		Set the drawing "window" for the axis.
			//	scale: Number
			//		The new scale for the axis.
			//	offset: Number
			//		The new offset for the axis.
			//	returns: dojox.charting.axis2d.Default
			//		The reference to the axis for functional chaining.
			this.scale  = scale;
			this.offset = offset;
			return this.clear();	//	dojox.charting.axis2d.Default
		},
		getWindowScale: function(){
			//	summary:
			//		Get the current windowing scale of the axis.
			return "scale" in this ? this.scale : 1;	//	Number
		},
		getWindowOffset: function(){
			//	summary:
			//		Get the current windowing offset for the axis.
			return "offset" in this ? this.offset : 0;	//	Number
		},
		_groupLabelWidth: function(labels, font, wcLimit){
			if(!labels.length){
				return 0;
			}
			if(lang.isObject(labels[0])){
				labels = df.map(labels, function(label){ return label.text; });
			}
			if (wcLimit) {
				labels = df.map(labels, function(label){
					return lang.trim(label).length == 0 ? "" : label.substring(0, wcLimit) + this.trailingSymbol;
				}, this);
			}
			var s = labels.join("<br>");
			return g._base._getTextBox(s, {font: font}).w || 0;
		},
		calculate: function(min, max, span, labels){
			//	summary:
			//		Perform all calculations needed to render this axis.
			//	min: Number
			//		The smallest value represented on this axis.
			//	max: Number
			//		The largest value represented on this axis.
			//	span: Number
			//		The span in pixels over which axis calculations are made.
			//	labels: String[]
			//		Optional list of labels.
			//	returns: dojox.charting.axis2d.Default
			//		The reference to the axis for functional chaining.
			if(this.initialized()){
				return this;
			}
			var o = this.opt;
			this.labels = "labels" in o  ? o.labels : labels;
			this.scaler = lin.buildScaler(min, max, span, o);
			var tsb = this.scaler.bounds;
			if("scale" in this){
				// calculate new range
				o.from = tsb.lower + this.offset;
				o.to   = (tsb.upper - tsb.lower) / this.scale + o.from;
				// make sure that bounds are correct
				if( !isFinite(o.from) ||
					isNaN(o.from) ||
					!isFinite(o.to) ||
					isNaN(o.to) ||
					o.to - o.from >= tsb.upper - tsb.lower
				){
					// any error --- remove from/to bounds
					delete o.from;
					delete o.to;
					delete this.scale;
					delete this.offset;
				}else{
					// shift the window, if we are out of bounds
					if(o.from < tsb.lower){
						o.to += tsb.lower - o.from;
						o.from = tsb.lower;
					}else if(o.to > tsb.upper){
						o.from += tsb.upper - o.to;
						o.to = tsb.upper;
					}
					// update the offset
					this.offset = o.from - tsb.lower;
				}
				// re-calculate the scaler
				this.scaler = lin.buildScaler(min, max, span, o);
				tsb = this.scaler.bounds;
				// cleanup
				if(this.scale == 1 && this.offset == 0){
					delete this.scale;
					delete this.offset;
				}
			}

			var ta = this.chart.theme.axis, labelWidth = 0, rotation = o.rotation % 360,
				// TODO: we use one font --- of major tick, we need to use major and minor fonts
				taFont = o.font || (ta.majorTick && ta.majorTick.font) || (ta.tick && ta.tick.font),
				size = taFont ? g.normalizedLength(g.splitFontString(taFont).size) : 0,
				cosr = Math.abs(Math.cos(rotation * Math.PI / 180)),
				sinr = Math.abs(Math.sin(rotation * Math.PI / 180));

			if(rotation < 0){
				rotation += 360;
			}

			if(size){
				if(this.vertical ? rotation != 0 && rotation != 180 : rotation != 90 && rotation != 270){
					// we need width of all labels
					if(this.labels){
						labelWidth = this._groupLabelWidth(this.labels, taFont, o.maxLabelCharCount);
					}else{
						var labelLength = Math.ceil(
								Math.log(
									Math.max(
										Math.abs(tsb.from),
										Math.abs(tsb.to)
									)
								) / Math.LN10
							),
							t = [];
						if(tsb.from < 0 || tsb.to < 0){
							t.push("-");
						}
						t.push(dstring.rep("9", labelLength));
						var precision = Math.floor(
							Math.log( tsb.to - tsb.from ) / Math.LN10
						);
						if(precision > 0){
							t.push(".");
							t.push(dstring.rep("9", precision));
						}
						labelWidth = g._base._getTextBox(
							t.join(""),
							{ font: taFont }
						).w;
					}
					labelWidth = o.maxLabelSize ? Math.min(o.maxLabelSize, labelWidth) : labelWidth;
				}else{
					labelWidth = size;
				}
				switch(rotation){
					case 0:
					case 90:
					case 180:
					case 270:
						// trivial cases: use labelWidth
						break;
					default:
						// rotated labels
						var gap1 = Math.sqrt(labelWidth * labelWidth + size * size),									// short labels
							gap2 = this.vertical ? size * cosr + labelWidth * sinr : labelWidth * cosr + size * sinr;	// slanted labels
						labelWidth = Math.min(gap1, gap2);
						break;
				}
			}

			this.scaler.minMinorStep = labelWidth + labelGap;
			this.ticks = lin.buildTicks(this.scaler, o);
			return this;	//	dojox.charting.axis2d.Default
		},
		getScaler: function(){
			//	summary:
			//		Get the pre-calculated scaler object.
			return this.scaler;	//	Object
		},
		getTicks: function(){
			//	summary:
			//		Get the pre-calculated ticks object.
			return this.ticks;	//	Object
		}
	});
});

},
'dojox/lang/utils':function(){
define("dojox/lang/utils", ["..", "dojo/_base/lang"], 
  function(dojox, lang){
	var du = lang.getObject("lang.utils", true, dojox);
	
	var empty = {}, opts = Object.prototype.toString;

	var clone = function(o){
		if(o){
			switch(opts.call(o)){
				case "[object Array]":
					return o.slice(0);
				case "[object Object]":
					return lang.delegate(o);
			}
		}
		return o;
	}
	
	lang.mixin(du, {
		coerceType: function(target, source){
			// summary: Coerces one object to the type of another.
			// target: Object: object, which typeof result is used to coerce "source" object.
			// source: Object: object, which will be forced to change type.
			switch(typeof target){
				case "number":	return Number(eval("(" + source + ")"));
				case "string":	return String(source);
				case "boolean":	return Boolean(eval("(" + source + ")"));
			}
			return eval("(" + source + ")");
		},
		
		updateWithObject: function(target, source, conv){
			// summary: Updates an existing object in place with properties from an "source" object.
			// target: Object: the "target" object to be updated
			// source: Object: the "source" object, whose properties will be used to source the existed object.
			// conv: Boolean?: force conversion to the original type
			if(!source){ return target; }
			for(var x in target){
				if(x in source && !(x in empty)){
					var t = target[x];
					if(t && typeof t == "object"){
						du.updateWithObject(t, source[x], conv);
					}else{
						target[x] = conv ? du.coerceType(t, source[x]) : clone(source[x]);
					}
				}
			}
			return target;	// Object
		},
	
		updateWithPattern: function(target, source, pattern, conv){
			// summary: Updates an existing object in place with properties from an "source" object.
			// target: Object: the "target" object to be updated
			// source: Object: the "source" object, whose properties will be used to source the existed object.
			// pattern: Object: object, whose properties will be used to pull values from the "source"
			// conv: Boolean?: force conversion to the original type
			if(!source || !pattern){ return target; }
			for(var x in pattern){
				if(x in source && !(x in empty)){
					target[x] = conv ? du.coerceType(pattern[x], source[x]) : clone(source[x]);
				}
			}
			return target;	// Object
		},
		
		merge: function(object, mixin){
			// summary: Merge two objects structurally, mixin properties will override object's properties.
			// object: Object: original object.
			// mixin: Object: additional object, which properties will override object's properties.
			if(mixin){
				var otype = opts.call(object), mtype = opts.call(mixin), t, i, l, m;
				switch(mtype){
					case "[object Array]":
						if(mtype == otype){
							t = new Array(Math.max(object.length, mixin.length));
							for(i = 0, l = t.length; i < l; ++i){
								t[i] = du.merge(object[i], mixin[i]);
							}
							return t;
						}
						return mixin.slice(0);
					case "[object Object]":
						if(mtype == otype && object){
							t = lang.delegate(object);
							for(i in mixin){
								if(i in object){
									l = object[i];
									m = mixin[i];
									if(m !== l){
										t[i] = du.merge(l, m);
									}
								}else{
									t[i] = lang.clone(mixin[i]);
								}
							}
							return t;
						}
						return lang.clone(mixin);
				}
			}
			return mixin;
		}
	});
	
	return du;
});

},
'dojox/lang/functional/lambda':function(){
define("dojox/lang/functional/lambda", ["../..", "dojo/_base/kernel", "dojo/_base/lang", "dojo/_base/array"], function(dojox, dojo, lang, arr){
	var df = lang.getObject("lang.functional", true, dojox);

// This module adds high-level functions and related constructs:
//	- anonymous functions built from the string

// Acknoledgements:
//	- lambda() is based on work by Oliver Steele
//		(http://osteele.com/sources/javascript/functional/functional.js)
//		which was published under MIT License

// Notes:
//	- lambda() produces functions, which after the compilation step are
//		as fast as regular JS functions (at least theoretically).

// Lambda input values:
//	- returns functions unchanged
//	- converts strings to functions
//	- converts arrays to a functional composition

	var lcache = {};

	// split() is augmented on IE6 to ensure the uniform behavior
	var split = "ab".split(/a*/).length > 1 ? String.prototype.split :
			function(sep){
				 var r = this.split.call(this, sep),
					 m = sep.exec(this);
				 if(m && m.index == 0){ r.unshift(""); }
				 return r;
			};
			
	var lambda = function(/*String*/ s){
		var args = [], sects = split.call(s, /\s*->\s*/m);
		if(sects.length > 1){
			while(sects.length){
				s = sects.pop();
				args = sects.pop().split(/\s*,\s*|\s+/m);
				if(sects.length){ sects.push("(function(" + args + "){return (" + s + ")})"); }
			}
		}else if(s.match(/\b_\b/)){
			args = ["_"];
		}else{
			var l = s.match(/^\s*(?:[+*\/%&|\^\.=<>]|!=)/m),
				r = s.match(/[+\-*\/%&|\^\.=<>!]\s*$/m);
			if(l || r){
				if(l){
					args.push("$1");
					s = "$1" + s;
				}
				if(r){
					args.push("$2");
					s = s + "$2";
				}
			}else{
				// the point of the long regex below is to exclude all well-known
				// lower-case words from the list of potential arguments
				var vars = s.
					replace(/(?:\b[A-Z]|\.[a-zA-Z_$])[a-zA-Z_$\d]*|[a-zA-Z_$][a-zA-Z_$\d]*:|this|true|false|null|undefined|typeof|instanceof|in|delete|new|void|arguments|decodeURI|decodeURIComponent|encodeURI|encodeURIComponent|escape|eval|isFinite|isNaN|parseFloat|parseInt|unescape|dojo|dijit|dojox|window|document|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "").
					match(/([a-z_$][a-z_$\d]*)/gi) || [], t = {};
				arr.forEach(vars, function(v){
					if(!(v in t)){
						args.push(v);
						t[v] = 1;
					}
				});
			}
		}
		return {args: args, body: s};	// Object
	};

	var compose = function(/*Array*/ a){
		return a.length ?
					function(){
						var i = a.length - 1, x = df.lambda(a[i]).apply(this, arguments);
						for(--i; i >= 0; --i){ x = df.lambda(a[i]).call(this, x); }
						return x;
					}
				:
					// identity
					function(x){ return x; };
	};

	lang.mixin(df, {
		// lambda
		rawLambda: function(/*String*/ s){
			// summary:
			//		builds a function from a snippet, or array (composing),
			//		returns an object describing the function; functions are
			//		passed through unmodified.
			// description:
			//		This method is to normalize a functional representation (a
			//		text snippet) to an object that contains an array of
			//		arguments, and a body , which is used to calculate the
			//		returning value.
			return lambda(s);	// Object
		},
		buildLambda: function(/*String*/ s){
			// summary:
			//		builds a function from a snippet, returns a string, which
			//		represents the function.
			// description:
			//		This method returns a textual representation of a function
			//		built from the snippet. It is meant to be evaled in the
			//		proper context, so local variables can be pulled from the
			//		environment.
			s = lambda(s);
			return "function(" + s.args.join(",") + "){return (" + s.body + ");}";	// String
		},
		lambda: function(/*Function|String|Array*/ s){
			// summary:
			//		builds a function from a snippet, or array (composing),
			//		returns a function object; functions are passed through
			//		unmodified.
			// description:
			//		This method is used to normalize a functional
			//		representation (a text snippet, an array, or a function) to
			//		a function object.
			if(typeof s == "function"){ return s; }
			if(s instanceof Array){ return compose(s); }
			if(s in lcache){ return lcache[s]; }
			s = lambda(s);
			return lcache[s] = new Function(s.args, "return (" + s.body + ");");	// Function
		},
		clearLambdaCache: function(){
			// summary:
			//		clears internal cache of lambdas
			lcache = {};
		}
	});
	
	return df;
});

},
'dojo/dom-form':function(){
define("dojo/dom-form", ["./_base/lang", "./dom", "./io-query", "./json"], function(lang, dom, ioq, json){
	// module:
	//		dojo/dom-form
	// summary:
	//		This module defines form-processing functions.

	/*=====
	dojo.fieldToObject = function(inputNode){
		// summary:
		//		Serialize a form field to a JavaScript object.
		// description:
		//		Returns the value encoded in a form field as
		//		as a string or an array of strings. Disabled form elements
		//		and unchecked radio and checkboxes are skipped.	Multi-select
		//		elements are returned as an array of string values.
		// inputNode: DOMNode|String
		// returns: Object
	};
	=====*/

	/*=====
    dojo.formToObject = function(formNode){
        // summary:
        //		Serialize a form node to a JavaScript object.
        // description:
        //		Returns the values encoded in an HTML form as
        //		string properties in an object which it then returns. Disabled form
        //		elements, buttons, and other non-value form elements are skipped.
        //		Multi-select elements are returned as an array of string values.
		// formNode: DOMNode|String
		// returns: Object
        //
        // example:
        //		This form:
        //		|	<form id="test_form">
        //		|		<input type="text" name="blah" value="blah">
        //		|		<input type="text" name="no_value" value="blah" disabled>
        //		|		<input type="button" name="no_value2" value="blah">
        //		|		<select type="select" multiple name="multi" size="5">
        //		|			<option value="blah">blah</option>
        //		|			<option value="thud" selected>thud</option>
        //		|			<option value="thonk" selected>thonk</option>
        //		|		</select>
        //		|	</form>
        //
        //		yields this object structure as the result of a call to
        //		formToObject():
        //
        //		|	{
        //		|		blah: "blah",
        //		|		multi: [
        //		|			"thud",
        //		|			"thonk"
        //		|		]
        //		|	};
    };
	=====*/

	/*=====
    dojo.formToQuery = function(formNode){
        // summary:
        //		Returns a URL-encoded string representing the form passed as either a
        //		node or string ID identifying the form to serialize
		// formNode: DOMNode|String
		// returns: String
    };
	=====*/

	/*=====
    dojo.formToJson = function(formNode, prettyPrint){
        // summary:
        //		Create a serialized JSON string from a form node or string
        //		ID identifying the form to serialize
		// formNode: DOMNode|String
		// prettyPrint: Boolean?
		// returns: String
    };
	=====*/

    function setValue(/*Object*/obj, /*String*/name, /*String*/value){
        // summary:
        //		For the named property in object, set the value. If a value
        //		already exists and it is a string, convert the value to be an
        //		array of values.

        // Skip it if there is no value
        if(value === null){
            return;
        }

        var val = obj[name];
        if(typeof val == "string"){ // inline'd type check
            obj[name] = [val, value];
        }else if(lang.isArray(val)){
            val.push(value);
        }else{
            obj[name] = value;
        }
    }

	var exclude = "file|submit|image|reset|button";

	var form = {
		fieldToObject: function fieldToObject(/*DOMNode|String*/ inputNode){
			var ret = null;
			inputNode = dom.byId(inputNode);
			if(inputNode){
				var _in = inputNode.name, type = (inputNode.type || "").toLowerCase();
				if(_in && type && !inputNode.disabled){
					if(type == "radio" || type == "checkbox"){
						if(inputNode.checked){
							ret = inputNode.value;
						}
					}else if(inputNode.multiple){
						ret = [];
						var nodes = [inputNode.firstChild];
						while(nodes.length){
							for(var node = nodes.pop(); node; node = node.nextSibling){
								if(node.nodeType == 1 && node.tagName.toLowerCase() == "option"){
									if(node.selected){
										ret.push(node.value);
									}
								}else{
									if(node.nextSibling){
										nodes.push(node.nextSibling);
									}
									if(node.firstChild){
										nodes.push(node.firstChild);
									}
									break;
								}
							}
						}
					}else{
						ret = inputNode.value;
					}
				}
			}
			return ret; // Object
		},

		toObject: function formToObject(/*DOMNode|String*/ formNode){
			var ret = {}, elems = dom.byId(formNode).elements;
			for(var i = 0, l = elems.length; i < l; ++i){
				var item = elems[i], _in = item.name, type = (item.type || "").toLowerCase();
				if(_in && type && exclude.indexOf(type) < 0 && !item.disabled){
					setValue(ret, _in, form.fieldToObject(item));
					if(type == "image"){
						ret[_in + ".x"] = ret[_in + ".y"] = ret[_in].x = ret[_in].y = 0;
					}
				}
			}
			return ret; // Object
		},

		toQuery: function formToQuery(/*DOMNode|String*/ formNode){
			return ioq.objectToQuery(form.toObject(formNode)); // String
		},

		toJson: function formToJson(/*DOMNode|String*/ formNode, /*Boolean?*/prettyPrint){
			return json.stringify(form.toObject(formNode), null, prettyPrint ? 4 : 0); // String
		}
	};

    return form;
});

},
'dojox/lang/functional/reversed':function(){
define("dojox/lang/functional/reversed", ["dojo/_base/lang", "dojo/_base/window" ,"./lambda"], 
	function(lang, win, df){
// This module adds high-level functions and related constructs:
//	- reversed versions of array-processing functions similar to standard JS functions

// Notes:
//	- this module provides reversed versions of standard array-processing functions:
//		forEachRev, mapRev, filterRev

// Defined methods:
//	- take any valid lambda argument as the functional argument
//	- operate on dense arrays
//	- take a string as the array argument

/*=====
	var df = dojox.lang.functional;
 =====*/
	lang.mixin(df, {
		// JS 1.6 standard array functions, which can take a lambda as a parameter.
		// Consider using dojo._base.array functions, if you don't need the lambda support.
		filterRev: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates a new array with all elements that pass the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var t = [], v, i = a.length - 1;
			for(; i >= 0; --i){
				v = a[i];
				if(f.call(o, v, i, a)){ t.push(v); }
			}
			return t;	// Array
		},
		forEachRev: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: executes a provided function once per array element.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			for(var i = a.length - 1; i >= 0; f.call(o, a[i], i, a), --i);
		},
		mapRev: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates a new array with the results of calling
			//	a provided function on every element in this array.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var n = a.length, t = new Array(n), i = n - 1, j = 0;
			for(; i >= 0; t[j++] = f.call(o, a[i], i, a), --i);
			return t;	// Array
		},
		everyRev: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: tests whether all elements in the array pass the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			for(var i = a.length - 1; i >= 0; --i){
				if(!f.call(o, a[i], i, a)){
					return false;	// Boolean
				}
			}
			return true;	// Boolean
		},
		someRev: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: tests whether some element in the array passes the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			for(var i = a.length - 1; i >= 0; --i){
				if(f.call(o, a[i], i, a)){
					return true;	// Boolean
				}
			}
			return false;	// Boolean
		}
	});
	
	return df;
});

},
'dojox/charting/scaler/primitive':function(){
define("dojox/charting/scaler/primitive", ["dojo/_base/lang"], 
  function(lang){
	var primitive = lang.getObject("dojox.charting.scaler.primitive", true);
	return lang.mixin(primitive, {
		buildScaler: function(/*Number*/ min, /*Number*/ max, /*Number*/ span, /*Object*/ kwArgs){
			if(min == max){
				// artificially extend bounds
				min -= 0.5;
				max += 0.5;
				// now the line will be centered
			}
			return {
				bounds: {
					lower: min,
					upper: max,
					from:  min,
					to:    max,
					scale: span / (max - min),
					span:  span
				},
				scaler: primitive
			};
		},
		buildTicks: function(/*Object*/ scaler, /*Object*/ kwArgs){
			return {major: [], minor: [], micro: []};	// Object
		},
		getTransformerFromModel: function(/*Object*/ scaler){
			var offset = scaler.bounds.from, scale = scaler.bounds.scale;
			return function(x){ return (x - offset) * scale; };	// Function
		},
		getTransformerFromPlot: function(/*Object*/ scaler){
			var offset = scaler.bounds.from, scale = scaler.bounds.scale;
			return function(x){ return x / scale + offset; };	// Function
		}
	});
});

},
'dojo/store/util/SimpleQueryEngine':function(){
define(["../../_base/array"], function(arrayUtil) {
  //  module:
  //    dojo/store/util/SimpleQueryEngine
  //  summary:
  //    The module defines a simple filtering query engine for object stores. 

return function(query, options){
	// summary:
	//		Simple query engine that matches using filter functions, named filter
	//		functions or objects by name-value on a query object hash
	//
	// description:
	//		The SimpleQueryEngine provides a way of getting a QueryResults through
	//		the use of a simple object hash as a filter.  The hash will be used to
	//		match properties on data objects with the corresponding value given. In
	//		other words, only exact matches will be returned.
	//
	//		This function can be used as a template for more complex query engines;
	//		for example, an engine can be created that accepts an object hash that
	//		contains filtering functions, or a string that gets evaluated, etc.
	//
	//		When creating a new dojo.store, simply set the store's queryEngine
	//		field as a reference to this function.
	//
	// query: Object
	//		An object hash with fields that may match fields of items in the store.
	//		Values in the hash will be compared by normal == operator, but regular expressions
	//		or any object that provides a test() method are also supported and can be
	// 		used to match strings by more complex expressions
	// 		(and then the regex's or object's test() method will be used to match values).
	//
	// options: dojo.store.util.SimpleQueryEngine.__queryOptions?
	//		An object that contains optional information such as sort, start, and count.
	//
	// returns: Function
	//		A function that caches the passed query under the field "matches".  See any
	//		of the "query" methods on dojo.stores.
	//
	// example:
	//		Define a store with a reference to this engine, and set up a query method.
	//
	//	|	var myStore = function(options){
	//	|		//	...more properties here
	//	|		this.queryEngine = dojo.store.util.SimpleQueryEngine;
	//	|		//	define our query method
	//	|		this.query = function(query, options){
	//	|			return dojo.store.util.QueryResults(this.queryEngine(query, options)(this.data));
	//	|		};
	//	|	};

	// create our matching query function
	switch(typeof query){
		default:
			throw new Error("Can not query with a " + typeof query);
		case "object": case "undefined":
			var queryObject = query;
			query = function(object){
				for(var key in queryObject){
					var required = queryObject[key];
					if(required && required.test){
						if(!required.test(object[key])){
							return false;
						}
					}else if(required != object[key]){
						return false;
					}
				}
				return true;
			};
			break;
		case "string":
			// named query
			if(!this[query]){
				throw new Error("No filter function " + query + " was found in store");
			}
			query = this[query];
			// fall through
		case "function":
			// fall through
	}
	function execute(array){
		// execute the whole query, first we filter
		var results = arrayUtil.filter(array, query);
		// next we sort
		if(options && options.sort){
			results.sort(function(a, b){
				for(var sort, i=0; sort = options.sort[i]; i++){
					var aValue = a[sort.attribute];
					var bValue = b[sort.attribute];
					if (aValue != bValue) {
						return !!sort.descending == aValue > bValue ? -1 : 1;
					}
				}
				return 0;
			});
		}
		// now we paginate
		if(options && (options.start || options.count)){
			var total = results.length;
			results = results.slice(options.start || 0, (options.start || 0) + (options.count || Infinity));
			results.total = total;
		}
		return results;
	}
	execute.matches = query;
	return execute;
};
});

},
'dojox/gfx/matrix':function(){
define("dojox/gfx/matrix", ["./_base","dojo/_base/lang"], 
  function(g, lang){
	var m = g.matrix = {};
	/*===== g = dojox.gfx; m = dojox.gfx.matrix =====*/

	// candidates for dojox.math:
	var _degToRadCache = {};
	m._degToRad = function(degree){
		return _degToRadCache[degree] || (_degToRadCache[degree] = (Math.PI * degree / 180));
	};
	m._radToDeg = function(radian){ return radian / Math.PI * 180; };

	m.Matrix2D = function(arg){
		// summary: 
		//		a 2D matrix object
		// description: Normalizes a 2D matrix-like object. If arrays is passed,
		//		all objects of the array are normalized and multiplied sequentially.
		// arg: Object
		//		a 2D matrix-like object, a number, or an array of such objects
		if(arg){
			if(typeof arg == "number"){
				this.xx = this.yy = arg;
			}else if(arg instanceof Array){
				if(arg.length > 0){
					var matrix = m.normalize(arg[0]);
					// combine matrices
					for(var i = 1; i < arg.length; ++i){
						var l = matrix, r = m.normalize(arg[i]);
						matrix = new m.Matrix2D();
						matrix.xx = l.xx * r.xx + l.xy * r.yx;
						matrix.xy = l.xx * r.xy + l.xy * r.yy;
						matrix.yx = l.yx * r.xx + l.yy * r.yx;
						matrix.yy = l.yx * r.xy + l.yy * r.yy;
						matrix.dx = l.xx * r.dx + l.xy * r.dy + l.dx;
						matrix.dy = l.yx * r.dx + l.yy * r.dy + l.dy;
					}
					lang.mixin(this, matrix);
				}
			}else{
				lang.mixin(this, arg);
			}
		}
	};

	// the default (identity) matrix, which is used to fill in missing values
	lang.extend(m.Matrix2D, {xx: 1, xy: 0, yx: 0, yy: 1, dx: 0, dy: 0});

	lang.mixin(m, {
		// summary: class constants, and methods of dojox.gfx.matrix

		// matrix constants

		// identity: dojox.gfx.matrix.Matrix2D
		//		an identity matrix constant: identity * (x, y) == (x, y)
		identity: new m.Matrix2D(),

		// flipX: dojox.gfx.matrix.Matrix2D
		//		a matrix, which reflects points at x = 0 line: flipX * (x, y) == (-x, y)
		flipX:    new m.Matrix2D({xx: -1}),

		// flipY: dojox.gfx.matrix.Matrix2D
		//		a matrix, which reflects points at y = 0 line: flipY * (x, y) == (x, -y)
		flipY:    new m.Matrix2D({yy: -1}),

		// flipXY: dojox.gfx.matrix.Matrix2D
		//		a matrix, which reflects points at the origin of coordinates: flipXY * (x, y) == (-x, -y)
		flipXY:   new m.Matrix2D({xx: -1, yy: -1}),

		// matrix creators

		translate: function(a, b){
			// summary: forms a translation matrix
			// description: The resulting matrix is used to translate (move) points by specified offsets.
			// a: Number: an x coordinate value
			// b: Number: a y coordinate value
			if(arguments.length > 1){
				return new m.Matrix2D({dx: a, dy: b}); // dojox.gfx.matrix.Matrix2D
			}
			// branch
			// a: dojox.gfx.Point: a point-like object, which specifies offsets for both dimensions
			// b: null
			return new m.Matrix2D({dx: a.x, dy: a.y}); // dojox.gfx.matrix.Matrix2D
		},
		scale: function(a, b){
			// summary: forms a scaling matrix
			// description: The resulting matrix is used to scale (magnify) points by specified offsets.
			// a: Number: a scaling factor used for the x coordinate
			// b: Number: a scaling factor used for the y coordinate
			if(arguments.length > 1){
				return new m.Matrix2D({xx: a, yy: b}); // dojox.gfx.matrix.Matrix2D
			}
			if(typeof a == "number"){
				// branch
				// a: Number: a uniform scaling factor used for the both coordinates
				// b: null
				return new m.Matrix2D({xx: a, yy: a}); // dojox.gfx.matrix.Matrix2D
			}
			// branch
			// a: dojox.gfx.Point: a point-like object, which specifies scale factors for both dimensions
			// b: null
			return new m.Matrix2D({xx: a.x, yy: a.y}); // dojox.gfx.matrix.Matrix2D
		},
		rotate: function(angle){
			// summary: forms a rotating matrix
			// description: The resulting matrix is used to rotate points
			//		around the origin of coordinates (0, 0) by specified angle.
			// angle: Number: an angle of rotation in radians (>0 for CW)
			var c = Math.cos(angle);
			var s = Math.sin(angle);
			return new m.Matrix2D({xx: c, xy: -s, yx: s, yy: c}); // dojox.gfx.matrix.Matrix2D
		},
		rotateg: function(degree){
			// summary: forms a rotating matrix
			// description: The resulting matrix is used to rotate points
			//		around the origin of coordinates (0, 0) by specified degree.
			//		See dojox.gfx.matrix.rotate() for comparison.
			// degree: Number: an angle of rotation in degrees (>0 for CW)
			return m.rotate(m._degToRad(degree)); // dojox.gfx.matrix.Matrix2D
		},
		skewX: function(angle) {
			// summary: forms an x skewing matrix
			// description: The resulting matrix is used to skew points in the x dimension
			//		around the origin of coordinates (0, 0) by specified angle.
			// angle: Number: an skewing angle in radians
			return new m.Matrix2D({xy: Math.tan(angle)}); // dojox.gfx.matrix.Matrix2D
		},
		skewXg: function(degree){
			// summary: forms an x skewing matrix
			// description: The resulting matrix is used to skew points in the x dimension
			//		around the origin of coordinates (0, 0) by specified degree.
			//		See dojox.gfx.matrix.skewX() for comparison.
			// degree: Number: an skewing angle in degrees
			return m.skewX(m._degToRad(degree)); // dojox.gfx.matrix.Matrix2D
		},
		skewY: function(angle){
			// summary: forms a y skewing matrix
			// description: The resulting matrix is used to skew points in the y dimension
			//		around the origin of coordinates (0, 0) by specified angle.
			// angle: Number: an skewing angle in radians
			return new m.Matrix2D({yx: Math.tan(angle)}); // dojox.gfx.matrix.Matrix2D
		},
		skewYg: function(degree){
			// summary: forms a y skewing matrix
			// description: The resulting matrix is used to skew points in the y dimension
			//		around the origin of coordinates (0, 0) by specified degree.
			//		See dojox.gfx.matrix.skewY() for comparison.
			// degree: Number: an skewing angle in degrees
			return m.skewY(m._degToRad(degree)); // dojox.gfx.matrix.Matrix2D
		},
		reflect: function(a, b){
			// summary: forms a reflection matrix
			// description: The resulting matrix is used to reflect points around a vector,
			//		which goes through the origin.
			// a: dojox.gfx.Point: a point-like object, which specifies a vector of reflection
			// b: null
			if(arguments.length == 1){
				b = a.y;
				a = a.x;
			}
			// branch
			// a: Number: an x coordinate value
			// b: Number: a y coordinate value

			// make a unit vector
			var a2 = a * a, b2 = b * b, n2 = a2 + b2, xy = 2 * a * b / n2;
			return new m.Matrix2D({xx: 2 * a2 / n2 - 1, xy: xy, yx: xy, yy: 2 * b2 / n2 - 1}); // dojox.gfx.matrix.Matrix2D
		},
		project: function(a, b){
			// summary: forms an orthogonal projection matrix
			// description: The resulting matrix is used to project points orthogonally on a vector,
			//		which goes through the origin.
			// a: dojox.gfx.Point: a point-like object, which specifies a vector of projection
			// b: null
			if(arguments.length == 1){
				b = a.y;
				a = a.x;
			}
			// branch
			// a: Number: an x coordinate value
			// b: Number: a y coordinate value

			// make a unit vector
			var a2 = a * a, b2 = b * b, n2 = a2 + b2, xy = a * b / n2;
			return new m.Matrix2D({xx: a2 / n2, xy: xy, yx: xy, yy: b2 / n2}); // dojox.gfx.matrix.Matrix2D
		},

		// ensure matrix 2D conformance
		normalize: function(matrix){
			// summary: converts an object to a matrix, if necessary
			// description: Converts any 2D matrix-like object or an array of
			//		such objects to a valid dojox.gfx.matrix.Matrix2D object.
			// matrix: Object: an object, which is converted to a matrix, if necessary
			return (matrix instanceof m.Matrix2D) ? matrix : new m.Matrix2D(matrix); // dojox.gfx.matrix.Matrix2D
		},

		// common operations

		clone: function(matrix){
			// summary: creates a copy of a 2D matrix
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix-like object to be cloned
			var obj = new m.Matrix2D();
			for(var i in matrix){
				if(typeof(matrix[i]) == "number" && typeof(obj[i]) == "number" && obj[i] != matrix[i]) obj[i] = matrix[i];
			}
			return obj; // dojox.gfx.matrix.Matrix2D
		},
		invert: function(matrix){
			// summary: inverts a 2D matrix
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix-like object to be inverted
			var M = m.normalize(matrix),
				D = M.xx * M.yy - M.xy * M.yx;
				M = new m.Matrix2D({
					xx: M.yy/D, xy: -M.xy/D,
					yx: -M.yx/D, yy: M.xx/D,
					dx: (M.xy * M.dy - M.yy * M.dx) / D,
					dy: (M.yx * M.dx - M.xx * M.dy) / D
				});
			return M; // dojox.gfx.matrix.Matrix2D
		},
		_multiplyPoint: function(matrix, x, y){
			// summary: applies a matrix to a point
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix object to be applied
			// x: Number: an x coordinate of a point
			// y: Number: a y coordinate of a point
			return {x: matrix.xx * x + matrix.xy * y + matrix.dx, y: matrix.yx * x + matrix.yy * y + matrix.dy}; // dojox.gfx.Point
		},
		multiplyPoint: function(matrix, /* Number||Point */ a, /* Number? */ b){
			// summary: applies a matrix to a point
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix object to be applied
			// a: Number: an x coordinate of a point
			// b: Number?: a y coordinate of a point
			var M = m.normalize(matrix);
			if(typeof a == "number" && typeof b == "number"){
				return m._multiplyPoint(M, a, b); // dojox.gfx.Point
			}
			// branch
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix object to be applied
			// a: dojox.gfx.Point: a point
			// b: null
			return m._multiplyPoint(M, a.x, a.y); // dojox.gfx.Point
		},
		multiply: function(matrix){
			// summary: combines matrices by multiplying them sequentially in the given order
			// matrix: dojox.gfx.matrix.Matrix2D...: a 2D matrix-like object,
			//		all subsequent arguments are matrix-like objects too
			var M = m.normalize(matrix);
			// combine matrices
			for(var i = 1; i < arguments.length; ++i){
				var l = M, r = m.normalize(arguments[i]);
				M = new m.Matrix2D();
				M.xx = l.xx * r.xx + l.xy * r.yx;
				M.xy = l.xx * r.xy + l.xy * r.yy;
				M.yx = l.yx * r.xx + l.yy * r.yx;
				M.yy = l.yx * r.xy + l.yy * r.yy;
				M.dx = l.xx * r.dx + l.xy * r.dy + l.dx;
				M.dy = l.yx * r.dx + l.yy * r.dy + l.dy;
			}
			return M; // dojox.gfx.matrix.Matrix2D
		},

		// high level operations

		_sandwich: function(matrix, x, y){
			// summary: applies a matrix at a centrtal point
			// matrix: dojox.gfx.matrix.Matrix2D: a 2D matrix-like object, which is applied at a central point
			// x: Number: an x component of the central point
			// y: Number: a y component of the central point
			return m.multiply(m.translate(x, y), matrix, m.translate(-x, -y)); // dojox.gfx.matrix.Matrix2D
		},
		scaleAt: function(a, b, c, d){
			// summary: scales a picture using a specified point as a center of scaling
			// description: Compare with dojox.gfx.matrix.scale().
			// a: Number: a scaling factor used for the x coordinate
			// b: Number: a scaling factor used for the y coordinate
			// c: Number: an x component of a central point
			// d: Number: a y component of a central point

			// accepts several signatures:
			//	1) uniform scale factor, Point
			//	2) uniform scale factor, x, y
			//	3) x scale, y scale, Point
			//	4) x scale, y scale, x, y

			switch(arguments.length){
				case 4:
					// a and b are scale factor components, c and d are components of a point
					return m._sandwich(m.scale(a, b), c, d); // dojox.gfx.matrix.Matrix2D
				case 3:
					if(typeof c == "number"){
						// branch
						// a: Number: a uniform scaling factor used for both coordinates
						// b: Number: an x component of a central point
						// c: Number: a y component of a central point
						// d: null
						return m._sandwich(m.scale(a), b, c); // dojox.gfx.matrix.Matrix2D
					}
					// branch
					// a: Number: a scaling factor used for the x coordinate
					// b: Number: a scaling factor used for the y coordinate
					// c: dojox.gfx.Point: a central point
					// d: null
					return m._sandwich(m.scale(a, b), c.x, c.y); // dojox.gfx.matrix.Matrix2D
			}
			// branch
			// a: Number: a uniform scaling factor used for both coordinates
			// b: dojox.gfx.Point: a central point
			// c: null
			// d: null
			return m._sandwich(m.scale(a), b.x, b.y); // dojox.gfx.matrix.Matrix2D
		},
		rotateAt: function(angle, a, b){
			// summary: rotates a picture using a specified point as a center of rotation
			// description: Compare with dojox.gfx.matrix.rotate().
			// angle: Number: an angle of rotation in radians (>0 for CW)
			// a: Number: an x component of a central point
			// b: Number: a y component of a central point

			// accepts several signatures:
			//	1) rotation angle in radians, Point
			//	2) rotation angle in radians, x, y

			if(arguments.length > 2){
				return m._sandwich(m.rotate(angle), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// angle: Number: an angle of rotation in radians (>0 for CCW)
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.rotate(angle), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		},
		rotategAt: function(degree, a, b){
			// summary: rotates a picture using a specified point as a center of rotation
			// description: Compare with dojox.gfx.matrix.rotateg().
			// degree: Number: an angle of rotation in degrees (>0 for CW)
			// a: Number: an x component of a central point
			// b: Number: a y component of a central point

			// accepts several signatures:
			//	1) rotation angle in degrees, Point
			//	2) rotation angle in degrees, x, y

			if(arguments.length > 2){
				return m._sandwich(m.rotateg(degree), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// degree: Number: an angle of rotation in degrees (>0 for CCW)
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.rotateg(degree), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		},
		skewXAt: function(angle, a, b){
			// summary: skews a picture along the x axis using a specified point as a center of skewing
			// description: Compare with dojox.gfx.matrix.skewX().
			// angle: Number: an skewing angle in radians
			// a: Number: an x component of a central point
			// b: Number: a y component of a central point

			// accepts several signatures:
			//	1) skew angle in radians, Point
			//	2) skew angle in radians, x, y

			if(arguments.length > 2){
				return m._sandwich(m.skewX(angle), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// angle: Number: an skewing angle in radians
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.skewX(angle), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		},
		skewXgAt: function(degree, a, b){
			// summary: skews a picture along the x axis using a specified point as a center of skewing
			// description: Compare with dojox.gfx.matrix.skewXg().
			// degree: Number: an skewing angle in degrees
			// a: Number: an x component of a central point
			// b: Number: a y component of a central point

			// accepts several signatures:
			//	1) skew angle in degrees, Point
			//	2) skew angle in degrees, x, y

			if(arguments.length > 2){
				return m._sandwich(m.skewXg(degree), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// degree: Number: an skewing angle in degrees
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.skewXg(degree), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		},
		skewYAt: function(angle, a, b){
			// summary: skews a picture along the y axis using a specified point as a center of skewing
			// description: Compare with dojox.gfx.matrix.skewY().
			// angle: Number: an skewing angle in radians
			// a: Number: an x component of a central point
			// b: Number: a y component of a central point

			// accepts several signatures:
			//	1) skew angle in radians, Point
			//	2) skew angle in radians, x, y

			if(arguments.length > 2){
				return m._sandwich(m.skewY(angle), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// angle: Number: an skewing angle in radians
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.skewY(angle), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		},
		skewYgAt: function(/* Number */ degree, /* Number||Point */ a, /* Number? */ b){
			// summary: skews a picture along the y axis using a specified point as a center of skewing
			// description: Compare with dojox.gfx.matrix.skewYg().
			// degree: Number: an skewing angle in degrees
			// a: Number: an x component of a central point
			// b: Number?: a y component of a central point

			// accepts several signatures:
			//	1) skew angle in degrees, Point
			//	2) skew angle in degrees, x, y

			if(arguments.length > 2){
				return m._sandwich(m.skewYg(degree), a, b); // dojox.gfx.matrix.Matrix2D
			}

			// branch
			// degree: Number: an skewing angle in degrees
			// a: dojox.gfx.Point: a central point
			// b: null
			return m._sandwich(m.skewYg(degree), a.x, a.y); // dojox.gfx.matrix.Matrix2D
		}

		//TODO: rect-to-rect mapping, scale-to-fit (isotropic and anisotropic versions)

	});
	// propagate Matrix2D up
	g.Matrix2D = m.Matrix2D;

	return m;
});



},
'dojox/color/_base':function(){
define("dojox/color/_base", ["dojo/_base/kernel", "../main", "dojo/_base/lang", "dojo/_base/Color", "dojo/colors"], 
	function(dojo, dojox, lang, Color, colors){

var cx = lang.getObject("dojox.color", true);
/*===== cx = dojox.color =====*/
		
//	alias all the dojo.Color mechanisms
cx.Color=Color;
cx.blend=Color.blendColors;
cx.fromRgb=Color.fromRgb;
cx.fromHex=Color.fromHex;
cx.fromArray=Color.fromArray;
cx.fromString=Color.fromString;

//	alias the dojo.colors mechanisms
cx.greyscale=colors.makeGrey;

lang.mixin(cx,{
	fromCmy: function(/* Object|Array|int */cyan, /*int*/magenta, /*int*/yellow){
		//	summary
		//	Create a dojox.color.Color from a CMY defined color.
		//	All colors should be expressed as 0-100 (percentage)
	
		if(lang.isArray(cyan)){
			magenta=cyan[1], yellow=cyan[2], cyan=cyan[0];
		} else if(lang.isObject(cyan)){
			magenta=cyan.m, yellow=cyan.y, cyan=cyan.c;
		}
		cyan/=100, magenta/=100, yellow/=100;
	
		var r=1-cyan, g=1-magenta, b=1-yellow;
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	},
	
	fromCmyk: function(/* Object|Array|int */cyan, /*int*/magenta, /*int*/yellow, /*int*/black){
		//	summary
		//	Create a dojox.color.Color from a CMYK defined color.
		//	All colors should be expressed as 0-100 (percentage)
	
		if(lang.isArray(cyan)){
			magenta=cyan[1], yellow=cyan[2], black=cyan[3], cyan=cyan[0];
		} else if(lang.isObject(cyan)){
			magenta=cyan.m, yellow=cyan.y, black=cyan.b, cyan=cyan.c;
		}
		cyan/=100, magenta/=100, yellow/=100, black/=100;
		var r,g,b;
		r = 1-Math.min(1, cyan*(1-black)+black);
		g = 1-Math.min(1, magenta*(1-black)+black);
		b = 1-Math.min(1, yellow*(1-black)+black);
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	},
		
	fromHsl: function(/* Object|Array|int */hue, /* int */saturation, /* int */luminosity){
		//	summary
		//	Create a dojox.color.Color from an HSL defined color.
		//	hue from 0-359 (degrees), saturation and luminosity 0-100.
	
		if(lang.isArray(hue)){
			saturation=hue[1], luminosity=hue[2], hue=hue[0];
		} else if(lang.isObject(hue)){
			saturation=hue.s, luminosity=hue.l, hue=hue.h;
		}
		saturation/=100;
		luminosity/=100;
	
		while(hue<0){ hue+=360; }
		while(hue>=360){ hue-=360; }
		
		var r, g, b;
		if(hue<120){
			r=(120-hue)/60, g=hue/60, b=0;
		} else if (hue<240){
			r=0, g=(240-hue)/60, b=(hue-120)/60;
		} else {
			r=(hue-240)/60, g=0, b=(360-hue)/60;
		}
		
		r=2*saturation*Math.min(r, 1)+(1-saturation);
		g=2*saturation*Math.min(g, 1)+(1-saturation);
		b=2*saturation*Math.min(b, 1)+(1-saturation);
		if(luminosity<0.5){
			r*=luminosity, g*=luminosity, b*=luminosity;
		}else{
			r=(1-luminosity)*r+2*luminosity-1;
			g=(1-luminosity)*g+2*luminosity-1;
			b=(1-luminosity)*b+2*luminosity-1;
		}
		return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
	}
});
	
cx.fromHsv = function(/* Object|Array|int */hue, /* int */saturation, /* int */value){
	//	summary
	//	Create a dojox.color.Color from an HSV defined color.
	//	hue from 0-359 (degrees), saturation and value 0-100.

	if(lang.isArray(hue)){
		saturation=hue[1], value=hue[2], hue=hue[0];
	} else if (lang.isObject(hue)){
		saturation=hue.s, value=hue.v, hue=hue.h;
	}
	
	if(hue==360){ hue=0; }
	saturation/=100;
	value/=100;
	
	var r, g, b;
	if(saturation==0){
		r=value, b=value, g=value;
	}else{
		var hTemp=hue/60, i=Math.floor(hTemp), f=hTemp-i;
		var p=value*(1-saturation);
		var q=value*(1-(saturation*f));
		var t=value*(1-(saturation*(1-f)));
		switch(i){
			case 0:{ r=value, g=t, b=p; break; }
			case 1:{ r=q, g=value, b=p; break; }
			case 2:{ r=p, g=value, b=t; break; }
			case 3:{ r=p, g=q, b=value; break; }
			case 4:{ r=t, g=p, b=value; break; }
			case 5:{ r=value, g=p, b=q; break; }
		}
	}
	return new Color({ r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) });	//	dojox.color.Color
};
lang.extend(Color,{
	toCmy: function(){
		//	summary
		//	Convert this Color to a CMY definition.
		var cyan=1-(this.r/255), magenta=1-(this.g/255), yellow=1-(this.b/255);
		return { c:Math.round(cyan*100), m:Math.round(magenta*100), y:Math.round(yellow*100) };		//	Object
	},
		
	toCmyk: function(){
		//	summary
		//	Convert this Color to a CMYK definition.
		var cyan, magenta, yellow, black;
		var r=this.r/255, g=this.g/255, b=this.b/255;
		black = Math.min(1-r, 1-g, 1-b);
		cyan = (1-r-black)/(1-black);
		magenta = (1-g-black)/(1-black);
		yellow = (1-b-black)/(1-black);
		return { c:Math.round(cyan*100), m:Math.round(magenta*100), y:Math.round(yellow*100), b:Math.round(black*100) };	//	Object
	},
		
	toHsl: function(){
		//	summary
		//	Convert this Color to an HSL definition.
		var r=this.r/255, g=this.g/255, b=this.b/255;
		var min = Math.min(r, b, g), max = Math.max(r, g, b);
		var delta = max-min;
		var h=0, s=0, l=(min+max)/2;
		if(l>0 && l<1){
			s = delta/((l<0.5)?(2*l):(2-2*l));
		}
		if(delta>0){
			if(max==r && max!=g){
				h+=(g-b)/delta;
			}
			if(max==g && max!=b){
				h+=(2+(b-r)/delta);
			}
			if(max==b && max!=r){
				h+=(4+(r-g)/delta);
			}
			h*=60;
		}
		return { h:h, s:Math.round(s*100), l:Math.round(l*100) };	//	Object
	},
	
	toHsv: function(){
		//	summary
		//	Convert this Color to an HSV definition.
		var r=this.r/255, g=this.g/255, b=this.b/255;
		var min = Math.min(r, b, g), max = Math.max(r, g, b);
		var delta = max-min;
		var h = null, s = (max==0)?0:(delta/max);
		if(s==0){
			h = 0;
		}else{
			if(r==max){
				h = 60*(g-b)/delta;
			}else if(g==max){
				h = 120 + 60*(b-r)/delta;
			}else{
				h = 240 + 60*(r-g)/delta;
			}
	
			if(h<0){ h+=360; }
		}
		return { h:h, s:Math.round(s*100), v:Math.round(max*100) };	//	Object
	}
});

return cx;
});

},
'dojo/aspect':function(){
define([], function(){

// TODOC: after/before/around return object
// TODOC: after/before/around param types. 

/*=====
	dojo.aspect = {
		// summary: provides aspect oriented programming functionality, allowing for
		//		one to add before, around, or after advice on existing methods.
		//
		// example:
		//	|	define(["dojo/aspect"], function(aspect){
		//	|		var signal = aspect.after(targetObject, "methodName", function(someArgument){
		//	|			this will be called when targetObject.methodName() is called, after the original function is called
		//	|		});
		//
		// example:
		//	The returned signal object can be used to cancel the advice.
		//	|	signal.remove(); // this will stop the advice from being executed anymore
		//	|	aspect.before(targetObject, "methodName", function(someArgument){
		//	|		// this will be called when targetObject.methodName() is called, before the original function is called
		//	|	 });
		
		after: function(target, methodName, advice, receiveArguments){
			// summary: The "after" export of the aspect module is a function that can be used to attach
			//		"after" advice to a method. This function will be executed after the original method
			//		is executed. By default the function will be called with a single argument, the return
			//		value of the original method, or the the return value of the last executed advice (if a previous one exists).
			//		The fourth (optional) argument can be set to true to so the function receives the original
			//		arguments (from when the original method was called) rather than the return value.
			//		If there are multiple "after" advisors, they are executed in the order they were registered.
			// target: Object
			//		This is the target object
			// methodName: String
			//		This is the name of the method to attach to.
			// advice: Function
			//		This is function to be called after the original method
			// receiveArguments: Boolean?
			//		If this is set to true, the advice function receives the original arguments (from when the original mehtod
			//		was called) rather than the return value of the original/previous method.
			// returns:
			//		A signal object that can be used to cancel the advice. If remove() is called on this signal object, it will
			//		stop the advice function from being executed.
		},
		
		before: function(target, methodName, advice){
			// summary: The "before" export of the aspect module is a function that can be used to attach
			//		"before" advice to a method. This function will be executed before the original method
			//		is executed. This function will be called with the arguments used to call the method.
			//		This function may optionally return an array as the new arguments to use to call
			//		the original method (or the previous, next-to-execute before advice, if one exists).
			//		If the before method doesn't return anything (returns undefined) the original arguments
			//		will be preserved.
			//		If there are multiple "before" advisors, they are executed in the reverse order they were registered.
			//
			// target: Object
			//		This is the target object
			// methodName: String
			//		This is the name of the method to attach to.
			// advice: Function
			//		This is function to be called before the original method	 
		},

		around: function(target, methodName, advice){
			// summary: The "around" export of the aspect module is a function that can be used to attach
			//		"around" advice to a method. The advisor function is immediately executed when
			//		the around() is called, is passed a single argument that is a function that can be
			//		called to continue execution of the original method (or the next around advisor).
			//		The advisor function should return a function, and this function will be called whenever
			//		the method is called. It will be called with the arguments used to call the method.
			//		Whatever this function returns will be returned as the result of the method call (unless after advise changes it).
			//
			// example:
			//		If there are multiple "around" advisors, the most recent one is executed first,
			//		which can then delegate to the next one and so on. For example:
			//		|	around(obj, "foo", function(originalFoo){
			//		|		return function(){
			//		|			var start = new Date().getTime();
			//		|			var results = originalFoo.apply(this, arguments); // call the original
			//		|			var end = new Date().getTime();
			//		|			console.log("foo execution took " + (end - start) + " ms");
			//		|			return results;
			//		|		};
			//		|	});
			//
			// target: Object
			//		This is the target object
			// methodName: String
			//		This is the name of the method to attach to.
			// advice: Function
			//		This is function to be called around the original method
		}

	};
=====*/

	"use strict";
	var nextId = 0;
	function advise(dispatcher, type, advice, receiveArguments){
		var previous = dispatcher[type];
		var around = type == "around";
		var signal;
		if(around){
			var advised = advice(function(){
				return previous.advice(this, arguments);
			});
			signal = {
				remove: function(){
					signal.cancelled = true;
				},
				advice: function(target, args){
					return signal.cancelled ?
						previous.advice(target, args) : // cancelled, skip to next one
						advised.apply(target, args);	// called the advised function
				}
			};
		}else{
			// create the remove handler
			signal = {
				remove: function(){
					var previous = signal.previous;
					var next = signal.next;
					if(!next && !previous){
						delete dispatcher[type];
					}else{
						if(previous){
							previous.next = next;
						}else{
							dispatcher[type] = next;
						}
						if(next){
							next.previous = previous;
						}
					}
				},
				id: nextId++,
				advice: advice,
				receiveArguments: receiveArguments
			};
		}
		if(previous && !around){
			if(type == "after"){
				// add the listener to the end of the list
				var next = previous;
				while(next){
					previous = next;
					next = next.next;
				}
				previous.next = signal;
				signal.previous = previous;
			}else if(type == "before"){
				// add to beginning
				dispatcher[type] = signal;
				signal.next = previous;
				previous.previous = signal;
			}
		}else{
			// around or first one just replaces
			dispatcher[type] = signal;
		}
		return signal;
	}
	function aspect(type){
		return function(target, methodName, advice, receiveArguments){
			var existing = target[methodName], dispatcher;
			if(!existing || existing.target != target){
				// no dispatcher in place
				target[methodName] = dispatcher = function(){
					var executionId = nextId;
					// before advice
					var args = arguments;
					var before = dispatcher.before;
					while(before){
						args = before.advice.apply(this, args) || args;
						before = before.next;
					}
					// around advice
					if(dispatcher.around){
						var results = dispatcher.around.advice(this, args);
					}
					// after advice
					var after = dispatcher.after;
					while(after && after.id < executionId){
						results = after.receiveArguments ? after.advice.apply(this, args) || results :
								after.advice.call(this, results);
						after = after.next;
					}
					return results;
				};
				if(existing){
					dispatcher.around = {advice: function(target, args){
						return existing.apply(target, args);
					}};
				}
				dispatcher.target = target;
			}
			var results = advise((dispatcher || existing), type, advice, receiveArguments);
			advice = null;
			return results;
		};
	}
	return {
		before: aspect("before"),
		around: aspect("around"),
		after: aspect("after")
	};
});

},
'dojo/topic':function(){
define(["./Evented"], function(Evented){
	// summary:
	//		The export of this module is a pubsub hub
	//		You can also use listen function itself as a pub/sub hub:
	//		| 	topic.subscribe("some/topic", function(event){
	//		|	... do something with event
	//		|	});
	//		|	topic.publish("some/topic", {name:"some event", ...});

	var hub = new Evented;
	return {
		publish: function(topic, event){
			// summary:
			//		Publishes a message to a topic on the pub/sub hub. All arguments after
			// 		the first will be passed to the subscribers, so any number of arguments
			// 		can be provided (not just event).
			// topic: String
			//		The name of the topic to publish to
			// event: Object
			//		An event to distribute to the topic listeners
			return hub.emit.apply(hub, arguments);
		},
		subscribe: function(topic, listener){
			// summary:
			//		Subcribes to a topic on the pub/sub hub
			// topic: String
			//		The topic to subscribe to
			//	listener: Function
			//		A function to call when a message is published to the given topic
			return hub.on.apply(hub, arguments);
		}
	}
});

},
'dojox/charting/Chart':function(){
define("dojox/charting/Chart", ["dojo/_base/lang", "dojo/_base/array","dojo/_base/declare", "dojo/_base/html", 
	"dojo/dom", "dojo/dom-geometry", "dojo/dom-construct","dojo/_base/Color", "dojo/_base/sniff",
	"./Element", "./Theme", "./Series", "./axis2d/common", "dojox/gfx/shape",
	"dojox/gfx", "dojox/lang/functional", "dojox/lang/functional/fold", "dojox/lang/functional/reversed"],
	function(lang, arr, declare, html, 
	 		 dom, domGeom, domConstruct, Color, has,
	 		 Element, Theme, Series, common, shape,
	 		 g, func, funcFold, funcReversed){
	/*=====
	dojox.charting.__ChartCtorArgs = function(margins, stroke, fill, delayInMs){
		//	summary:
		//		The keyword arguments that can be passed in a Chart constructor.
		//
		//	margins: Object?
		//		Optional margins for the chart, in the form of { l, t, r, b}.
		//	stroke: dojox.gfx.Stroke?
		//		An optional outline/stroke for the chart.
		//	fill: dojox.gfx.Fill?
		//		An optional fill for the chart.
		//	delayInMs: Number
		//		Delay in ms for delayedRender(). Default: 200.
		this.margins = margins;
		this.stroke = stroke;
		this.fill = fill;
		this.delayInMs = delayInMs;
	}
	 =====*/
	var dc = dojox.charting,
		clear = func.lambda("item.clear()"),
		purge = func.lambda("item.purgeGroup()"),
		destroy = func.lambda("item.destroy()"),
		makeClean = func.lambda("item.dirty = false"),
		makeDirty = func.lambda("item.dirty = true"),
		getName = func.lambda("item.name");

	declare("dojox.charting.Chart", null, {
		//	summary:
		//		The main chart object in dojox.charting.  This will create a two dimensional
		//		chart based on dojox.gfx.
		//
		//	description:
		//		dojox.charting.Chart is the primary object used for any kind of charts.  It
		//		is simple to create--just pass it a node reference, which is used as the
		//		container for the chart--and a set of optional keyword arguments and go.
		//
		//		Note that like most of dojox.gfx, most of dojox.charting.Chart's methods are
		//		designed to return a reference to the chart itself, to allow for functional
		//		chaining.  This makes defining everything on a Chart very easy to do.
		//
		//	example:
		//		Create an area chart, with smoothing.
		//	|	new dojox.charting.Chart(node))
		//	|		.addPlot("default", { type: "Areas", tension: "X" })
		//	|		.setTheme(dojox.charting.themes.Shrooms)
		//	|		.addSeries("Series A", [1, 2, 0.5, 1.5, 1, 2.8, 0.4])
		//	|		.addSeries("Series B", [2.6, 1.8, 2, 1, 1.4, 0.7, 2])
		//	|		.addSeries("Series C", [6.3, 1.8, 3, 0.5, 4.4, 2.7, 2])
		//	|		.render();
		//
		//	example:
		//		The form of data in a data series can take a number of forms: a simple array,
		//		an array of objects {x,y}, or something custom (as determined by the plot).
		//		Here's an example of a Candlestick chart, which expects an object of
		//		{ open, high, low, close }.
		//	|	new dojox.charting.Chart(node))
		//	|		.addPlot("default", {type: "Candlesticks", gap: 1})
		//	|		.addAxis("x", {fixLower: "major", fixUpper: "major", includeZero: true})
		//	|		.addAxis("y", {vertical: true, fixLower: "major", fixUpper: "major", natural: true})
		//	|		.addSeries("Series A", [
		//	|				{ open: 20, close: 16, high: 22, low: 8 },
		//	|				{ open: 16, close: 22, high: 26, low: 6, mid: 18 },
		//	|				{ open: 22, close: 18, high: 22, low: 11, mid: 21 },
		//	|				{ open: 18, close: 29, high: 32, low: 14, mid: 27 },
		//	|				{ open: 29, close: 24, high: 29, low: 13, mid: 27 },
		//	|				{ open: 24, close: 8, high: 24, low: 5 },
		//	|				{ open: 8, close: 16, high: 22, low: 2 },
		//	|				{ open: 16, close: 12, high: 19, low: 7 },
		//	|				{ open: 12, close: 20, high: 22, low: 8 },
		//	|				{ open: 20, close: 16, high: 22, low: 8 },
		//	|				{ open: 16, close: 22, high: 26, low: 6, mid: 18 },
		//	|				{ open: 22, close: 18, high: 22, low: 11, mid: 21 },
		//	|				{ open: 18, close: 29, high: 32, low: 14, mid: 27 },
		//	|				{ open: 29, close: 24, high: 29, low: 13, mid: 27 },
		//	|				{ open: 24, close: 8, high: 24, low: 5 },
		//	|				{ open: 8, close: 16, high: 22, low: 2 },
		//	|				{ open: 16, close: 12, high: 19, low: 7 },
		//	|				{ open: 12, close: 20, high: 22, low: 8 },
		//	|				{ open: 20, close: 16, high: 22, low: 8 },
		//	|				{ open: 16, close: 22, high: 26, low: 6 },
		//	|				{ open: 22, close: 18, high: 22, low: 11 },
		//	|				{ open: 18, close: 29, high: 32, low: 14 },
		//	|				{ open: 29, close: 24, high: 29, low: 13 },
		//	|				{ open: 24, close: 8, high: 24, low: 5 },
		//	|				{ open: 8, close: 16, high: 22, low: 2 },
		//	|				{ open: 16, close: 12, high: 19, low: 7 },
		//	|				{ open: 12, close: 20, high: 22, low: 8 },
		//	|				{ open: 20, close: 16, high: 22, low: 8 }
		//	|			],
		//	|			{ stroke: { color: "green" }, fill: "lightgreen" }
		//	|		)
		//	|		.render();
		
		//	theme: dojox.charting.Theme?
		//		An optional theme to use for styling the chart.
		//	axes: dojox.charting.Axis{}?
		//		A map of axes for use in plotting a chart.
		//	stack: dojox.charting.plot2d.Base[]
		//		A stack of plotters.
		//	plots: dojox.charting.plot2d.Base{}
		//		A map of plotter indices
		//	series: dojox.charting.Series[]
		//		The stack of data runs used to create plots.
		//	runs: dojox.charting.Series{}
		//		A map of series indices
		//	margins: Object?
		//		The margins around the chart. Default is { l:10, t:10, r:10, b:10 }.
		//	stroke: dojox.gfx.Stroke?
		//		The outline of the chart (stroke in vector graphics terms).
		//	fill: dojox.gfx.Fill?
		//		The color for the chart.
		//	node: DOMNode
		//		The container node passed to the constructor.
		//	surface: dojox.gfx.Surface
		//		The main graphics surface upon which a chart is drawn.
		//	dirty: Boolean
		//		A boolean flag indicating whether or not the chart needs to be updated/re-rendered.
		//	coords: Object
		//		The coordinates on a page of the containing node, as returned from dojo.coords.

		constructor: function(/* DOMNode */node, /* dojox.charting.__ChartCtorArgs? */kwArgs){
			//	summary:
			//		The constructor for a new Chart.  Initializes all parameters used for a chart.
			//	returns: dojox.charting.Chart
			//		The newly created chart.

			// initialize parameters
			if(!kwArgs){ kwArgs = {}; }
			this.margins   = kwArgs.margins ? kwArgs.margins : {l: 10, t: 10, r: 10, b: 10};
			this.stroke    = kwArgs.stroke;
			this.fill      = kwArgs.fill;
			this.delayInMs = kwArgs.delayInMs || 200;
			this.title     = kwArgs.title;
			this.titleGap  = kwArgs.titleGap;
			this.titlePos  = kwArgs.titlePos;
			this.titleFont = kwArgs.titleFont;
			this.titleFontColor = kwArgs.titleFontColor;
			this.chartTitle = null;

			// default initialization
			this.theme = null;
			this.axes = {};		// map of axes
			this.stack = [];	// stack of plotters
			this.plots = {};	// map of plotter indices
			this.series = [];	// stack of data runs
			this.runs = {};		// map of data run indices
			this.dirty = true;
			this.coords = null;

			this._clearRects = [];

			// create a surface
			this.node = dom.byId(node);
			var box = domGeom.getMarginBox(node);
			this.surface = g.createSurface(this.node, box.w || 400, box.h || 300);
		},
		destroy: function(){
			//	summary:
			//		Cleanup when a chart is to be destroyed.
			//	returns: void
			arr.forEach(this.series, destroy);
			arr.forEach(this.stack,  destroy);
			func.forIn(this.axes, destroy);
			if(this.chartTitle && this.chartTitle.tagName){
				// destroy title if it is a DOM node
				domConstruct.destroy(this.chartTitle);
			}
			arr.forEach(this._clearRects, function(child){
				shape.dispose(child);
			});
			this.surface.destroy();
		},
		getCoords: function(){
			//	summary:
			//		Get the coordinates and dimensions of the containing DOMNode, as
			//		returned by dojo.coords.
			//	returns: Object
			//		The resulting coordinates of the chart.  See dojo.coords for details.
			return html.coords(this.node, true); // Object
		},
		setTheme: function(theme){
			//	summary:
			//		Set a theme of the chart.
			//	theme: dojox.charting.Theme
			//		The theme to be used for visual rendering.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			this.theme = theme.clone();
			this.dirty = true;
			return this;	//	dojox.charting.Chart
		},
		addAxis: function(name, kwArgs){
			//	summary:
			//		Add an axis to the chart, for rendering.
			//	name: String
			//		The name of the axis.
			//	kwArgs: dojox.charting.axis2d.__AxisCtorArgs?
			//		An optional keyword arguments object for use in defining details of an axis.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var axis, axisType = kwArgs && kwArgs.type || "Default";
			if(typeof axisType == "string"){
				if(!dc.axis2d || !dc.axis2d[axisType]){
					throw Error("Can't find axis: " + axisType + " - Check " + "require() dependencies.");
				}
				axis = new dc.axis2d[axisType](this, kwArgs);
			}else{
				axis = new axisType(this, kwArgs);
			}
			axis.name = name;
			axis.dirty = true;
			if(name in this.axes){
				this.axes[name].destroy();
			}
			this.axes[name] = axis;
			this.dirty = true;
			return this;	//	dojox.charting.Chart
		},
		getAxis: function(name){
			//	summary:
			//		Get the given axis, by name.
			//	name: String
			//		The name the axis was defined by.
			//	returns: dojox.charting.axis2d.Default
			//		The axis as stored in the chart's axis map.
			return this.axes[name];	//	dojox.charting.axis2d.Default
		},
		removeAxis: function(name){
			//	summary:
			//		Remove the axis that was defined using name.
			//	name: String
			//		The axis name, as defined in addAxis.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.axes){
				// destroy the axis
				this.axes[name].destroy();
				delete this.axes[name];
				// mark the chart as dirty
				this.dirty = true;
			}
			return this;	//	dojox.charting.Chart
		},
		addPlot: function(name, kwArgs){
			//	summary:
			//		Add a new plot to the chart, defined by name and using the optional keyword arguments object.
			//		Note that dojox.charting assumes the main plot to be called "default"; if you do not have
			//		a plot called "default" and attempt to add data series to the chart without specifying the
			//		plot to be rendered on, you WILL get errors.
			//	name: String
			//		The name of the plot to be added to the chart.  If you only plan on using one plot, call it "default".
			//	kwArgs: dojox.charting.plot2d.__PlotCtorArgs
			//		An object with optional parameters for the plot in question.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var plot, plotType = kwArgs && kwArgs.type || "Default";
			if(typeof plotType == "string"){
				if(!dc.plot2d || !dc.plot2d[plotType]){
					throw Error("Can't find plot: " + plotType + " - didn't you forget to dojo" + ".require() it?");
				}
				plot = new dc.plot2d[plotType](this, kwArgs);
			}else{
				plot = new plotType(this, kwArgs);
			}
			plot.name = name;
			plot.dirty = true;
			if(name in this.plots){
				this.stack[this.plots[name]].destroy();
				this.stack[this.plots[name]] = plot;
			}else{
				this.plots[name] = this.stack.length;
				this.stack.push(plot);
			}
			this.dirty = true;
			return this;	//	dojox.charting.Chart
		},
		getPlot: function(name){
			//	summary:
			//		Get the given plot, by name.
			//	name: String
			//		The name the plot was defined by.
			//	returns: dojox.charting.plot2d.Base
			//		The plot.
			return this.stack[this.plots[name]];
		},
		removePlot: function(name){
			//	summary:
			//		Remove the plot defined using name from the chart's plot stack.
			//	name: String
			//		The name of the plot as defined using addPlot.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.plots){
				// get the index and remove the name
				var index = this.plots[name];
				delete this.plots[name];
				// destroy the plot
				this.stack[index].destroy();
				// remove the plot from the stack
				this.stack.splice(index, 1);
				// update indices to reflect the shift
				func.forIn(this.plots, function(idx, name, plots){
					if(idx > index){
						plots[name] = idx - 1;
					}
				});
				// remove all related series
				var ns = arr.filter(this.series, function(run){ return run.plot != name; });
				if(ns.length < this.series.length){
					// kill all removed series
					arr.forEach(this.series, function(run){
						if(run.plot == name){
							run.destroy();
						}
					});
					// rebuild all necessary data structures
					this.runs = {};
					arr.forEach(ns, function(run, index){
						this.runs[run.plot] = index;
					}, this);
					this.series = ns;
				}
				// mark the chart as dirty
				this.dirty = true;
			}
			return this;	//	dojox.charting.Chart
		},
		getPlotOrder: function(){
			//	summary:
			//		Returns an array of plot names in the current order
			//		(the top-most plot is the first).
			//	returns: Array
			return func.map(this.stack, getName); // Array
		},
		setPlotOrder: function(newOrder){
			//	summary:
			//		Sets new order of plots. newOrder cannot add or remove
			//		plots. Wrong names, or dups are ignored.
			//	newOrder: Array:
			//		Array of plot names compatible with getPlotOrder().
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var names = {},
				order = func.filter(newOrder, function(name){
					if(!(name in this.plots) || (name in names)){
						return false;
					}
					names[name] = 1;
					return true;
				}, this);
			if(order.length < this.stack.length){
				func.forEach(this.stack, function(plot){
					var name = plot.name;
					if(!(name in names)){
						order.push(name);
					}
				});
			}
			var newStack = func.map(order, function(name){
					return this.stack[this.plots[name]];
				}, this);
			func.forEach(newStack, function(plot, i){
				this.plots[plot.name] = i;
			}, this);
			this.stack = newStack;
			this.dirty = true;
			return this;	//	dojox.charting.Chart
		},
		movePlotToFront: function(name){
			//	summary:
			//		Moves a given plot to front.
			//	name: String:
			//		Plot's name to move.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.plots){
				var index = this.plots[name];
				if(index){
					var newOrder = this.getPlotOrder();
					newOrder.splice(index, 1);
					newOrder.unshift(name);
					return this.setPlotOrder(newOrder);	//	dojox.charting.Chart
				}
			}
			return this;	//	dojox.charting.Chart
		},
		movePlotToBack: function(name){
			//	summary:
			//		Moves a given plot to back.
			//	name: String:
			//		Plot's name to move.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.plots){
				var index = this.plots[name];
				if(index < this.stack.length - 1){
					var newOrder = this.getPlotOrder();
					newOrder.splice(index, 1);
					newOrder.push(name);
					return this.setPlotOrder(newOrder);	//	dojox.charting.Chart
				}
			}
			return this;	//	dojox.charting.Chart
		},
		addSeries: function(name, data, kwArgs){
			//	summary:
			//		Add a data series to the chart for rendering.
			//	name: String:
			//		The name of the data series to be plotted.
			//	data: Array|Object:
			//		The array of data points (either numbers or objects) that
			//		represents the data to be drawn. Or it can be an object. In
			//		the latter case, it should have a property "data" (an array),
			//		destroy(), and setSeriesObject().
			//	kwArgs: dojox.charting.__SeriesCtorArgs?:
			//		An optional keyword arguments object that will be mixed into
			//		the resultant series object.
			//	returns: dojox.charting.Chart:
			//		A reference to the current chart for functional chaining.
			var run = new Series(this, data, kwArgs);
			run.name = name;
			if(name in this.runs){
				this.series[this.runs[name]].destroy();
				this.series[this.runs[name]] = run;
			}else{
				this.runs[name] = this.series.length;
				this.series.push(run);
			}
			this.dirty = true;
			// fix min/max
			if(!("ymin" in run) && "min" in run){ run.ymin = run.min; }
			if(!("ymax" in run) && "max" in run){ run.ymax = run.max; }
			return this;	//	dojox.charting.Chart
		},
		getSeries: function(name){
			//	summary:
			//		Get the given series, by name.
			//	name: String
			//		The name the series was defined by.
			//	returns: dojox.charting.Series
			//		The series.
			return this.series[this.runs[name]];
		},
		removeSeries: function(name){
			//	summary:
			//		Remove the series defined by name from the chart.
			//	name: String
			//		The name of the series as defined by addSeries.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.runs){
				// get the index and remove the name
				var index = this.runs[name];
				delete this.runs[name];
				// destroy the run
				this.series[index].destroy();
				// remove the run from the stack of series
				this.series.splice(index, 1);
				// update indices to reflect the shift
				func.forIn(this.runs, function(idx, name, runs){
					if(idx > index){
						runs[name] = idx - 1;
					}
				});
				this.dirty = true;
			}
			return this;	//	dojox.charting.Chart
		},
		updateSeries: function(name, data){
			//	summary:
			//		Update the given series with a new set of data points.
			//	name: String
			//		The name of the series as defined in addSeries.
			//	data: Array|Object:
			//		The array of data points (either numbers or objects) that
			//		represents the data to be drawn. Or it can be an object. In
			//		the latter case, it should have a property "data" (an array),
			//		destroy(), and setSeriesObject().
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.runs){
				var run = this.series[this.runs[name]];
				run.update(data);
				this._invalidateDependentPlots(run.plot, false);
				this._invalidateDependentPlots(run.plot, true);
			}
			return this;	//	dojox.charting.Chart
		},
		getSeriesOrder: function(plotName){
			//	summary:
			//		Returns an array of series names in the current order
			//		(the top-most series is the first) within a plot.
			//	plotName: String:
			//		Plot's name.
			//	returns: Array
			return func.map(func.filter(this.series, function(run){
					return run.plot == plotName;
				}), getName);
		},
		setSeriesOrder: function(newOrder){
			//	summary:
			//		Sets new order of series within a plot. newOrder cannot add
			//		or remove series. Wrong names, or dups are ignored.
			//	newOrder: Array:
			//		Array of series names compatible with getPlotOrder(). All
			//		series should belong to the same plot.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var plotName, names = {},
				order = func.filter(newOrder, function(name){
					if(!(name in this.runs) || (name in names)){
						return false;
					}
					var run = this.series[this.runs[name]];
					if(plotName){
						if(run.plot != plotName){
							return false;
						}
					}else{
						plotName = run.plot;
					}
					names[name] = 1;
					return true;
				}, this);
			func.forEach(this.series, function(run){
				var name = run.name;
				if(!(name in names) && run.plot == plotName){
					order.push(name);
				}
			});
			var newSeries = func.map(order, function(name){
					return this.series[this.runs[name]];
				}, this);
			this.series = newSeries.concat(func.filter(this.series, function(run){
				return run.plot != plotName;
			}));
			func.forEach(this.series, function(run, i){
				this.runs[run.name] = i;
			}, this);
			this.dirty = true;
			return this;	//	dojox.charting.Chart
		},
		moveSeriesToFront: function(name){
			//	summary:
			//		Moves a given series to front of a plot.
			//	name: String:
			//		Series' name to move.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.runs){
				var index = this.runs[name],
					newOrder = this.getSeriesOrder(this.series[index].plot);
				if(name != newOrder[0]){
					newOrder.splice(index, 1);
					newOrder.unshift(name);
					return this.setSeriesOrder(newOrder);	//	dojox.charting.Chart
				}
			}
			return this;	//	dojox.charting.Chart
		},
		moveSeriesToBack: function(name){
			//	summary:
			//		Moves a given series to back of a plot.
			//	name: String:
			//		Series' name to move.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(name in this.runs){
				var index = this.runs[name],
					newOrder = this.getSeriesOrder(this.series[index].plot);
				if(name != newOrder[newOrder.length - 1]){
					newOrder.splice(index, 1);
					newOrder.push(name);
					return this.setSeriesOrder(newOrder);	//	dojox.charting.Chart
				}
			}
			return this;	//	dojox.charting.Chart
		},
		resize: function(width, height){
			//	summary:
			//		Resize the chart to the dimensions of width and height.
			//	description:
			//		Resize the chart and its surface to the width and height dimensions.
			//		If no width/height or box is provided, resize the surface to the marginBox of the chart.
			//	width: Number
			//		The new width of the chart.
			//	height: Number
			//		The new height of the chart.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var box;
			switch(arguments.length){
				// case 0, do not resize the div, just the surface
				case 1:
					// argument, override node box
					box = lang.mixin({}, width);
					domGeom.setMarginBox(this.node, box);
					break;
				case 2:
					box = {w: width, h: height};
					// argument, override node box
					domGeom.setMarginBox(this.node, box);
					break;
			}
			// in all cases take back the computed box
			box = domGeom.getMarginBox(this.node);
			var d = this.surface.getDimensions();
			if(d.width != box.w || d.height != box.h){
				// and set it on the surface
				this.surface.setDimensions(box.w, box.h);
				this.dirty = true;
				return this.render();	//	dojox.charting.Chart
			}else{
				return this;
			}
		},
		getGeometry: function(){
			//	summary:
			//		Returns a map of information about all axes in a chart and what they represent
			//		in terms of scaling (see dojox.charting.axis2d.Default.getScaler).
			//	returns: Object
			//		An map of geometry objects, a one-to-one mapping of axes.
			var ret = {};
			func.forIn(this.axes, function(axis){
				if(axis.initialized()){
					ret[axis.name] = {
						name:		axis.name,
						vertical:	axis.vertical,
						scaler:		axis.scaler,
						ticks:		axis.ticks
					};
				}
			});
			return ret;	//	Object
		},
		setAxisWindow: function(name, scale, offset, zoom){
			//	summary:
			//		Zooms an axis and all dependent plots. Can be used to zoom in 1D.
			//	name: String
			//		The name of the axis as defined by addAxis.
			//	scale: Number
			//		The scale on the target axis.
			//	offset: Number
			//		Any offest, as measured by axis tick
			//	zoom: Boolean|Object?
			//		The chart zooming animation trigger.  This is null by default,
			//		e.g. {duration: 1200}, or just set true.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			var axis = this.axes[name];
			if(axis){
				axis.setWindow(scale, offset);
				arr.forEach(this.stack,function(plot){
					if(plot.hAxis == name || plot.vAxis == name){
						plot.zoom = zoom;
					}
				});
			}
			return this;	//	dojox.charting.Chart
		},
		setWindow: function(sx, sy, dx, dy, zoom){
			//	summary:
			//		Zooms in or out any plots in two dimensions.
			//	sx: Number
			//		The scale for the x axis.
			//	sy: Number
			//		The scale for the y axis.
			//	dx: Number
			//		The pixel offset on the x axis.
			//	dy: Number
			//		The pixel offset on the y axis.
			//	zoom: Boolean|Object?
			//		The chart zooming animation trigger.  This is null by default,
			//		e.g. {duration: 1200}, or just set true.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(!("plotArea" in this)){
				this.calculateGeometry();
			}
			func.forIn(this.axes, function(axis){
				var scale, offset, bounds = axis.getScaler().bounds,
					s = bounds.span / (bounds.upper - bounds.lower);
				if(axis.vertical){
					scale  = sy;
					offset = dy / s / scale;
				}else{
					scale  = sx;
					offset = dx / s / scale;
				}
				axis.setWindow(scale, offset);
			});
			arr.forEach(this.stack, function(plot){ plot.zoom = zoom; });
			return this;	//	dojox.charting.Chart
		},
		zoomIn:	function(name, range){
			//	summary:
			//		Zoom the chart to a specific range on one axis.  This calls render()
			//		directly as a convenience method.
			//	name: String
			//		The name of the axis as defined by addAxis.
			//	range: Array
			//		The end points of the zoom range, measured in axis ticks.
			var axis = this.axes[name];
			if(axis){
				var scale, offset, bounds = axis.getScaler().bounds;
				var lower = Math.min(range[0],range[1]);
				var upper = Math.max(range[0],range[1]);
				lower = range[0] < bounds.lower ? bounds.lower : lower;
				upper = range[1] > bounds.upper ? bounds.upper : upper;
				scale = (bounds.upper - bounds.lower) / (upper - lower);
				offset = lower - bounds.lower;
				this.setAxisWindow(name, scale, offset);
				this.render();
			}
		},
		calculateGeometry: function(){
			//	summary:
			//		Calculate the geometry of the chart based on the defined axes of
			//		a chart.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(this.dirty){
				return this.fullGeometry();
			}

			// calculate geometry
			var dirty = arr.filter(this.stack, function(plot){
					return plot.dirty ||
						(plot.hAxis && this.axes[plot.hAxis].dirty) ||
						(plot.vAxis && this.axes[plot.vAxis].dirty);
				}, this);
			calculateAxes(dirty, this.plotArea);

			return this;	//	dojox.charting.Chart
		},
		fullGeometry: function(){
			//	summary:
			//		Calculate the full geometry of the chart.  This includes passing
			//		over all major elements of a chart (plots, axes, series, container)
			//		in order to ensure proper rendering.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			this._makeDirty();

			// clear old values
			arr.forEach(this.stack, clear);

			// rebuild new connections, and add defaults

			// set up a theme
			if(!this.theme){
				this.setTheme(new Theme(dojox.charting._def));
			}

			// assign series
			arr.forEach(this.series, function(run){
				if(!(run.plot in this.plots)){
					if(!dc.plot2d || !dc.plot2d.Default){
						throw Error("Can't find plot: Default - didn't you forget to dojo" + ".require() it?");
					}
					var plot = new dc.plot2d.Default(this, {});
					plot.name = run.plot;
					this.plots[run.plot] = this.stack.length;
					this.stack.push(plot);
				}
				this.stack[this.plots[run.plot]].addSeries(run);
			}, this);
			// assign axes
			arr.forEach(this.stack, function(plot){
				if(plot.hAxis){
					plot.setAxis(this.axes[plot.hAxis]);
				}
				if(plot.vAxis){
					plot.setAxis(this.axes[plot.vAxis]);
				}
			}, this);

			// calculate geometry

			// 1st pass
			var dim = this.dim = this.surface.getDimensions();
			dim.width  = g.normalizedLength(dim.width);
			dim.height = g.normalizedLength(dim.height);
			func.forIn(this.axes, clear);
			calculateAxes(this.stack, dim);

			// assumption: we don't have stacked axes yet
			var offsets = this.offsets = { l: 0, r: 0, t: 0, b: 0 };
			func.forIn(this.axes, function(axis){
				func.forIn(axis.getOffsets(), function(o, i){ offsets[i] += o; });
			});
			// add title area
			if(this.title){
				this.titleGap = (this.titleGap==0) ? 0 : this.titleGap || this.theme.chart.titleGap || 20;
				this.titlePos = this.titlePos || this.theme.chart.titlePos || "top";
				this.titleFont = this.titleFont || this.theme.chart.titleFont;
				this.titleFontColor = this.titleFontColor || this.theme.chart.titleFontColor || "black";
				var tsize = g.normalizedLength(g.splitFontString(this.titleFont).size);
				offsets[this.titlePos=="top" ? "t":"b"] += (tsize + this.titleGap);
			}
			// add margins
			func.forIn(this.margins, function(o, i){ offsets[i] += o; });

			// 2nd pass with realistic dimensions
			this.plotArea = {
				width: dim.width - offsets.l - offsets.r,
				height: dim.height - offsets.t - offsets.b
			};
			func.forIn(this.axes, clear);
			calculateAxes(this.stack, this.plotArea);

			return this;	//	dojox.charting.Chart
		},
		render: function(){
			//	summary:
			//		Render the chart according to the current information defined.  This should
			//		be the last call made when defining/creating a chart, or if data within the
			//		chart has been changed.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(this.theme){
				this.theme.clear();
			}

			if(this.dirty){
				return this.fullRender();
			}

			this.calculateGeometry();

			// go over the stack backwards
			func.forEachRev(this.stack, function(plot){ plot.render(this.dim, this.offsets); }, this);

			// go over axes
			func.forIn(this.axes, function(axis){ axis.render(this.dim, this.offsets); }, this);

			this._makeClean();

			// BEGIN FOR HTML CANVAS
			if(this.surface.render){ this.surface.render(); };
			// END FOR HTML CANVAS

			return this;	//	dojox.charting.Chart
		},
		fullRender: function(){
			//	summary:
			//		Force a full rendering of the chart, including full resets on the chart itself.
			//		You should not call this method directly unless absolutely necessary.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.

			// calculate geometry
			this.fullGeometry();
			var offsets = this.offsets, dim = this.dim, rect;

			// get required colors
			//var requiredColors = func.foldl(this.stack, "z + plot.getRequiredColors()", 0);
			//this.theme.defineColors({num: requiredColors, cache: false});

			// clear old shapes
			arr.forEach(this.series, purge);
			func.forIn(this.axes, purge);
			arr.forEach(this.stack,  purge);
			arr.forEach(this._clearRects, function(child){
				shape.dispose(child);
			});
			this._clearRects = [];
			if(this.chartTitle && this.chartTitle.tagName){
				// destroy title if it is a DOM node
			    domConstruct.destroy(this.chartTitle);
            }
			this.surface.clear();
			this.chartTitle = null;

			// generate shapes

			// draw a plot background
			var t = this.theme,
				fill   = t.plotarea && t.plotarea.fill,
				stroke = t.plotarea && t.plotarea.stroke,
				// size might be neg if offsets are bigger that chart size this happens quite often at 
				// initialization time if the chart widget is used in a BorderContainer
				// this will fail on IE/VML
				w = Math.max(0, dim.width  - offsets.l - offsets.r),
				h = Math.max(0, dim.height - offsets.t - offsets.b),
				rect = {
					x: offsets.l - 1, y: offsets.t - 1,
					width:  w + 2,
					height: h + 2
				};
			if(fill){
				fill = Element.prototype._shapeFill(Element.prototype._plotFill(fill, dim, offsets), rect);
				this._clearRects.push(this.surface.createRect(rect).setFill(fill));
			}
			if(stroke){
				this._clearRects.push(this.surface.createRect({
					x: offsets.l, y: offsets.t,
					width:  w + 1,
					height: h + 1
				}).setStroke(stroke));
			}

			// go over the stack backwards
			func.foldr(this.stack, function(z, plot){ return plot.render(dim, offsets), 0; }, 0);

			// pseudo-clipping: matting
			fill   = this.fill   !== undefined ? this.fill   : (t.chart && t.chart.fill);
			stroke = this.stroke !== undefined ? this.stroke : (t.chart && t.chart.stroke);

			//	TRT: support for "inherit" as a named value in a theme.
			if(fill == "inherit"){
				//	find the background color of the nearest ancestor node, and use that explicitly.
				var node = this.node, fill = new Color(html.style(node, "backgroundColor"));
				while(fill.a==0 && node!=document.documentElement){
					fill = new Color(html.style(node, "backgroundColor"));
					node = node.parentNode;
				}
			}

			if(fill){
				fill = Element.prototype._plotFill(fill, dim, offsets);
				if(offsets.l){	// left
					rect = {
						width:  offsets.l,
						height: dim.height + 1
					};
					this._clearRects.push(this.surface.createRect(rect).setFill(Element.prototype._shapeFill(fill, rect)));
				}
				if(offsets.r){	// right
					rect = {
						x: dim.width - offsets.r,
						width:  offsets.r + 1,
						height: dim.height + 2
					};
					this._clearRects.push(this.surface.createRect(rect).setFill(Element.prototype._shapeFill(fill, rect)));
				}
				if(offsets.t){	// top
					rect = {
						width:  dim.width + 1,
						height: offsets.t
					};
					this._clearRects.push(this.surface.createRect(rect).setFill(Element.prototype._shapeFill(fill, rect)));
				}
				if(offsets.b){	// bottom
					rect = {
						y: dim.height - offsets.b,
						width:  dim.width + 1,
						height: offsets.b + 2
					};
					this._clearRects.push(this.surface.createRect(rect).setFill(Element.prototype._shapeFill(fill, rect)));
				}
			}
			if(stroke){
				this._clearRects.push(this.surface.createRect({
					width:  dim.width - 1,
					height: dim.height - 1
				}).setStroke(stroke));
			}

			//create title: Whether to make chart title as a widget which extends dojox.charting.Element?
			if(this.title){
				var forceHtmlLabels = (g.renderer == "canvas"),
					labelType = forceHtmlLabels || !has("ie") && !has("opera") ? "html" : "gfx",
					tsize = g.normalizedLength(g.splitFontString(this.titleFont).size);
				this.chartTitle = common.createText[labelType](
					this,
					this.surface,
					dim.width/2,
					this.titlePos=="top" ? tsize + this.margins.t : dim.height - this.margins.b,
					"middle",
					this.title,
					this.titleFont,
					this.titleFontColor
				);
			}

			// go over axes
			func.forIn(this.axes, function(axis){ axis.render(dim, offsets); });

			this._makeClean();

			// BEGIN FOR HTML CANVAS
			if(this.surface.render){ this.surface.render(); };
			// END FOR HTML CANVAS

			return this;	//	dojox.charting.Chart
		},
		delayedRender: function(){
			//	summary:
			//		Delayed render, which is used to collect multiple updates
			//		within a delayInMs time window.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.

			if(!this._delayedRenderHandle){
				this._delayedRenderHandle = setTimeout(
					lang.hitch(this, function(){
						clearTimeout(this._delayedRenderHandle);
						this._delayedRenderHandle = null;
						this.render();
					}),
					this.delayInMs
				);
			}

			return this;	//	dojox.charting.Chart
		},
		connectToPlot: function(name, object, method){
			//	summary:
			//		A convenience method to connect a function to a plot.
			//	name: String
			//		The name of the plot as defined by addPlot.
			//	object: Object
			//		The object to be connected.
			//	method: Function
			//		The function to be executed.
			//	returns: Array
			//		A handle to the connection, as defined by dojo.connect (see dojo.connect).
			return name in this.plots ? this.stack[this.plots[name]].connect(object, method) : null;	//	Array
		},
		fireEvent: function(seriesName, eventName, index){
			//	summary:
			//		Fires a synthetic event for a series item.
			//	seriesName: String:
			//		Series name.
			//	eventName: String:
			//		Event name to simulate: onmouseover, onmouseout, onclick.
			//	index: Number:
			//		Valid data value index for the event.
			//	returns: dojox.charting.Chart
			//		A reference to the current chart for functional chaining.
			if(seriesName in this.runs){
				var plotName = this.series[this.runs[seriesName]].plot;
				if(plotName in this.plots){
					var plot = this.stack[this.plots[plotName]];
					if(plot){
						plot.fireEvent(seriesName, eventName, index);
					}
				}
			}
			return this;	//	dojox.charting.Chart
		},
		_makeClean: function(){
			// reset dirty flags
			arr.forEach(this.axes,   makeClean);
			arr.forEach(this.stack,  makeClean);
			arr.forEach(this.series, makeClean);
			this.dirty = false;
		},
		_makeDirty: function(){
			// reset dirty flags
			arr.forEach(this.axes,   makeDirty);
			arr.forEach(this.stack,  makeDirty);
			arr.forEach(this.series, makeDirty);
			this.dirty = true;
		},
		_invalidateDependentPlots: function(plotName, /* Boolean */ verticalAxis){
			if(plotName in this.plots){
				var plot = this.stack[this.plots[plotName]], axis,
					axisName = verticalAxis ? "vAxis" : "hAxis";
				if(plot[axisName]){
					axis = this.axes[plot[axisName]];
					if(axis && axis.dependOnData()){
						axis.dirty = true;
						// find all plots and mark them dirty
						arr.forEach(this.stack, function(p){
							if(p[axisName] && p[axisName] == plot[axisName]){
								p.dirty = true;
							}
						});
					}
				}else{
					plot.dirty = true;
				}
			}
		}
	});

	function hSection(stats){
		return {min: stats.hmin, max: stats.hmax};
	}

	function vSection(stats){
		return {min: stats.vmin, max: stats.vmax};
	}

	function hReplace(stats, h){
		stats.hmin = h.min;
		stats.hmax = h.max;
	}

	function vReplace(stats, v){
		stats.vmin = v.min;
		stats.vmax = v.max;
	}

	function combineStats(target, source){
		if(target && source){
			target.min = Math.min(target.min, source.min);
			target.max = Math.max(target.max, source.max);
		}
		return target || source;
	}

	function calculateAxes(stack, plotArea){
		var plots = {}, axes = {};
		arr.forEach(stack, function(plot){
			var stats = plots[plot.name] = plot.getSeriesStats();
			if(plot.hAxis){
				axes[plot.hAxis] = combineStats(axes[plot.hAxis], hSection(stats));
			}
			if(plot.vAxis){
				axes[plot.vAxis] = combineStats(axes[plot.vAxis], vSection(stats));
			}
		});
		arr.forEach(stack, function(plot){
			var stats = plots[plot.name];
			if(plot.hAxis){
				hReplace(stats, axes[plot.hAxis]);
			}
			if(plot.vAxis){
				vReplace(stats, axes[plot.vAxis]);
			}
			plot.initializeScalers(plotArea, stats);
		});
	}
	
	return dojox.charting.Chart;
});

},
'dojo/cookie':function(){
define(["./_base/kernel", "./regexp"], function(dojo, regexp) {
	// module:
	//		dojo/cookie
	// summary:
	//		TODOC


/*=====
dojo.__cookieProps = function(){
	//	expires: Date|String|Number?
	//		If a number, the number of days from today at which the cookie
	//		will expire. If a date, the date past which the cookie will expire.
	//		If expires is in the past, the cookie will be deleted.
	//		If expires is omitted or is 0, the cookie will expire when the browser closes.
	//	path: String?
	//		The path to use for the cookie.
	//	domain: String?
	//		The domain to use for the cookie.
	//	secure: Boolean?
	//		Whether to only send the cookie on secure connections
	this.expires = expires;
	this.path = path;
	this.domain = domain;
	this.secure = secure;
}
=====*/


dojo.cookie = function(/*String*/name, /*String?*/value, /*dojo.__cookieProps?*/props){
	//	summary:
	//		Get or set a cookie.
	//	description:
	// 		If one argument is passed, returns the value of the cookie
	// 		For two or more arguments, acts as a setter.
	//	name:
	//		Name of the cookie
	//	value:
	//		Value for the cookie
	//	props:
	//		Properties for the cookie
	//	example:
	//		set a cookie with the JSON-serialized contents of an object which
	//		will expire 5 days from now:
	//	|	dojo.cookie("configObj", dojo.toJson(config), { expires: 5 });
	//
	//	example:
	//		de-serialize a cookie back into a JavaScript object:
	//	|	var config = dojo.fromJson(dojo.cookie("configObj"));
	//
	//	example:
	//		delete a cookie:
	//	|	dojo.cookie("configObj", null, {expires: -1});
	var c = document.cookie, ret;
	if(arguments.length == 1){
		var matches = c.match(new RegExp("(?:^|; )" + regexp.escapeString(name) + "=([^;]*)"));
		ret = matches ? decodeURIComponent(matches[1]) : undefined; 
	}else{
		props = props || {};
// FIXME: expires=0 seems to disappear right away, not on close? (FF3)  Change docs?
		var exp = props.expires;
		if(typeof exp == "number"){
			var d = new Date();
			d.setTime(d.getTime() + exp*24*60*60*1000);
			exp = props.expires = d;
		}
		if(exp && exp.toUTCString){ props.expires = exp.toUTCString(); }

		value = encodeURIComponent(value);
		var updatedCookie = name + "=" + value, propName;
		for(propName in props){
			updatedCookie += "; " + propName;
			var propValue = props[propName];
			if(propValue !== true){ updatedCookie += "=" + propValue; }
		}
		document.cookie = updatedCookie;
	}
	return ret; // String|undefined
};

dojo.cookie.isSupported = function(){
	//	summary:
	//		Use to determine if the current browser supports cookies or not.
	//
	//		Returns true if user allows cookies.
	//		Returns false if user doesn't allow cookies.

	if(!("cookieEnabled" in navigator)){
		this("__djCookieTest__", "CookiesAllowed");
		navigator.cookieEnabled = this("__djCookieTest__") == "CookiesAllowed";
		if(navigator.cookieEnabled){
			this("__djCookieTest__", "", {expires: -1});
		}
	}
	return navigator.cookieEnabled;
};

return dojo.cookie;
});

},
'dojo/NodeList-dom':function(){
define(["./_base/kernel", "./query", "./_base/array", "./_base/lang", "./dom-class", "./dom-construct", "./dom-geometry", "./dom-attr", "./dom-style"], function(dojo, query, array, lang, domCls, domCtr, domGeom, domAttr, domStyle){
	/*===== var NodeList = dojo.NodeList; =====*/
	var magicGuard = function(a){
		// summary:
		//		the guard function for dojo.attr() and dojo.style()
		return a.length == 1 && (typeof a[0] == "string"); // inline'd type check
	};

	var orphan = function(node){
		// summary:
		//		function to orphan nodes
		var p = node.parentNode;
		if(p){
			p.removeChild(node);
		}
	};
	// FIXME: should we move orphan() to dojo.html?

	var NodeList = query.NodeList,
		awc = NodeList._adaptWithCondition,
		aafe = NodeList._adaptAsForEach,
		aam = NodeList._adaptAsMap;

	function getSet(module){
		return function(node, name, value){
			if(arguments.length == 2){
				return module[typeof name == "string" ? "get" : "set"](node, name);
			}
			// setter
			return module.set(node, name, value);
		};
	}

	lang.extend(NodeList, {
		_normalize: function(/*String||Element||Object||NodeList*/content, /*DOMNode?*/refNode){
			// summary:
			//		normalizes data to an array of items to insert.
			// description:
			//		If content is an object, it can have special properties "template" and
			//		"parse". If "template" is defined, then the template value is run through
			//		dojo.string.substitute (if dojo.string.substitute has been dojo.required elsewhere),
			//		or if templateFunc is a function on the content, that function will be used to
			//		transform the template into a final string to be used for for passing to dojo._toDom.
			//		If content.parse is true, then it is remembered for later, for when the content
			//		nodes are inserted into the DOM. At that point, the nodes will be parsed for widgets
			//		(if dojo.parser has been dojo.required elsewhere).

			//Wanted to just use a DocumentFragment, but for the array/NodeList
			//case that meant using cloneNode, but we may not want that.
			//Cloning should only happen if the node operations span
			//multiple refNodes. Also, need a real array, not a NodeList from the
			//DOM since the node movements could change those NodeLists.

			var parse = content.parse === true;

			//Do we have an object that needs to be run through a template?
			if(typeof content.template == "string"){
				var templateFunc = content.templateFunc || (dojo.string && dojo.string.substitute);
				content = templateFunc ? templateFunc(content.template, content) : content;
			}

			var type = (typeof content);
			if(type == "string" || type == "number"){
				content = domCtr.toDom(content, (refNode && refNode.ownerDocument));
				if(content.nodeType == 11){
					//DocumentFragment. It cannot handle cloneNode calls, so pull out the children.
					content = lang._toArray(content.childNodes);
				}else{
					content = [content];
				}
			}else if(!lang.isArrayLike(content)){
				content = [content];
			}else if(!lang.isArray(content)){
				//To get to this point, content is array-like, but
				//not an array, which likely means a DOM NodeList. Convert it now.
				content = lang._toArray(content);
			}

			//Pass around the parse info
			if(parse){
				content._runParse = true;
			}
			return content; //Array
		},

		_cloneNode: function(/*DOMNode*/ node){
			// summary:
			//		private utility to clone a node. Not very interesting in the vanilla
			//		dojo.NodeList case, but delegates could do interesting things like
			//		clone event handlers if that is derivable from the node.
			return node.cloneNode(true);
		},

		_place: function(/*Array*/ary, /*DOMNode*/refNode, /*String*/position, /*Boolean*/useClone){
			// summary:
			//		private utility to handle placing an array of nodes relative to another node.
			// description:
			//		Allows for cloning the nodes in the array, and for
			//		optionally parsing widgets, if ary._runParse is true.

			//Avoid a disallowed operation if trying to do an innerHTML on a non-element node.
			if(refNode.nodeType != 1 && position == "only"){
				return;
			}
			var rNode = refNode, tempNode;

			//Always cycle backwards in case the array is really a
			//DOM NodeList and the DOM operations take it out of the live collection.
			var length = ary.length;
			for(var i = length - 1; i >= 0; i--){
				var node = (useClone ? this._cloneNode(ary[i]) : ary[i]);

				//If need widget parsing, use a temp node, instead of waiting after inserting into
				//real DOM because we need to start widget parsing at one node up from current node,
				//which could cause some already parsed widgets to be parsed again.
				if(ary._runParse && dojo.parser && dojo.parser.parse){
					if(!tempNode){
						tempNode = rNode.ownerDocument.createElement("div");
					}
					tempNode.appendChild(node);
					dojo.parser.parse(tempNode);
					node = tempNode.firstChild;
					while(tempNode.firstChild){
						tempNode.removeChild(tempNode.firstChild);
					}
				}

				if(i == length - 1){
					domCtr.place(node, rNode, position);
				}else{
					rNode.parentNode.insertBefore(node, rNode);
				}
				rNode = node;
			}
		},

		/*=====
		position: function(){
			// summary:
			//		Returns border-box objects (x/y/w/h) of all elements in a node list
			//		as an Array (*not* a NodeList). Acts like `dojo.position`, though
			//		assumes the node passed is each node in this list.

			return dojo.map(this, dojo.position); // Array
		},

		attr: function(property, value){
			// summary:
			//		gets or sets the DOM attribute for every element in the
			//		NodeList. See also `dojo.attr`
			// property: String
			//		the attribute to get/set
			// value: String?
			//		optional. The value to set the property to
			// returns:
			//		if no value is passed, the result is an array of attribute values
			//		If a value is passed, the return is this NodeList
			// example:
			//		Make all nodes with a particular class focusable:
			//	|	dojo.query(".focusable").attr("tabIndex", -1);
			// example:
			//		Disable a group of buttons:
			//	|	dojo.query("button.group").attr("disabled", true);
			// example:
			//		innerHTML can be assigned or retrieved as well:
			//	|	// get the innerHTML (as an array) for each list item
			//	|	var ih = dojo.query("li.replaceable").attr("innerHTML");
			return; // dojo.NodeList
			return; // Array
		},

		style: function(property, value){
			// summary:
			//		gets or sets the CSS property for every element in the NodeList
			// property: String
			//		the CSS property to get/set, in JavaScript notation
			//		("lineHieght" instead of "line-height")
			// value: String?
			//		optional. The value to set the property to
			// returns:
			//		if no value is passed, the result is an array of strings.
			//		If a value is passed, the return is this NodeList
			return; // dojo.NodeList
			return; // Array
		},

		addClass: function(className){
			// summary:
			//		adds the specified class to every node in the list
			// className: String|Array
			//		A String class name to add, or several space-separated class names,
			//		or an array of class names.
			return; // dojo.NodeList
		},

		removeClass: function(className){
			// summary:
			//		removes the specified class from every node in the list
			// className: String|Array?
			//		An optional String class name to remove, or several space-separated
			//		class names, or an array of class names. If omitted, all class names
			//		will be deleted.
			// returns:
			//		dojo.NodeList, this list
			return; // dojo.NodeList
		},

		toggleClass: function(className, condition){
			// summary:
			//		Adds a class to node if not present, or removes if present.
			//		Pass a boolean condition if you want to explicitly add or remove.
			// condition: Boolean?
			//		If passed, true means to add the class, false means to remove.
			// className: String
			//		the CSS class to add
			return; // dojo.NodeList
		},

		empty: function(){
			// summary:
			//		clears all content from each node in the list. Effectively
			//		equivalent to removing all child nodes from every item in
			//		the list.
			return this.forEach("item.innerHTML='';"); // dojo.NodeList
			// FIXME: should we be checking for and/or disposing of widgets below these nodes?
		},
		=====*/

		// useful html methods
		attr: awc(getSet(domAttr), magicGuard),
		style: awc(getSet(domStyle), magicGuard),

		addClass: aafe(domCls.add),
		removeClass: aafe(domCls.remove),
		replaceClass: aafe(domCls.replace),
		toggleClass: aafe(domCls.toggle),

		empty: aafe(domCtr.empty),
		removeAttr: aafe(domAttr.remove),

		position: aam(domGeom.position),
		marginBox: aam(domGeom.getMarginBox),

		// FIXME: connectPublisher()? connectRunOnce()?

		/*
		destroy: function(){
			// summary:
			//		destroys every item in the list.
			this.forEach(d.destroy);
			// FIXME: should we be checking for and/or disposing of widgets below these nodes?
		},
		*/

		place: function(/*String||Node*/ queryOrNode, /*String*/ position){
			// summary:
			//		places elements of this node list relative to the first element matched
			//		by queryOrNode. Returns the original NodeList. See: `dojo.place`
			// queryOrNode:
			//		may be a string representing any valid CSS3 selector or a DOM node.
			//		In the selector case, only the first matching element will be used
			//		for relative positioning.
			// position:
			//		can be one of:
			//		|	"last" (default)
			//		|	"first"
			//		|	"before"
			//		|	"after"
			//		|	"only"
			//		|	"replace"
			//		or an offset in the childNodes property
			var item = query(queryOrNode)[0];
			return this.forEach(function(node){ domCtr.place(node, item, position); }); // dojo.NodeList
		},

		orphan: function(/*String?*/ filter){
			// summary:
			//		removes elements in this list that match the filter
			//		from their parents and returns them as a new NodeList.
			// filter:
			//		CSS selector like ".foo" or "div > span"
			// returns:
			//		`dojo.NodeList` containing the orphaned elements
			return (filter ? query._filterResult(this, filter) : this).forEach(orphan); // dojo.NodeList
		},

		adopt: function(/*String||Array||DomNode*/ queryOrListOrNode, /*String?*/ position){
			// summary:
			//		places any/all elements in queryOrListOrNode at a
			//		position relative to the first element in this list.
			//		Returns a dojo.NodeList of the adopted elements.
			// queryOrListOrNode:
			//		a DOM node or a query string or a query result.
			//		Represents the nodes to be adopted relative to the
			//		first element of this NodeList.
			// position:
			//		can be one of:
			//		|	"last" (default)
			//		|	"first"
			//		|	"before"
			//		|	"after"
			//		|	"only"
			//		|	"replace"
			//		or an offset in the childNodes property
			return query(queryOrListOrNode).place(this[0], position)._stash(this);	// dojo.NodeList
		},

		// FIXME: do we need this?
		query: function(/*String*/ queryStr){
			// summary:
			//		Returns a new list whose members match the passed query,
			//		assuming elements of the current NodeList as the root for
			//		each search.
			// example:
			//		assume a DOM created by this markup:
			//	|	<div id="foo">
			//	|		<p>
			//	|			bacon is tasty, <span>dontcha think?</span>
			//	|		</p>
			//	|	</div>
			//	|	<div id="bar">
			//	|		<p>great comedians may not be funny <span>in person</span></p>
			//	|	</div>
			//		If we are presented with the following definition for a NodeList:
			//	|	var l = new dojo.NodeList(dojo.byId("foo"), dojo.byId("bar"));
			//		it's possible to find all span elements under paragraphs
			//		contained by these elements with this sub-query:
			//	|	var spans = l.query("p span");

			// FIXME: probably slow
			if(!queryStr){ return this; }
			var ret = new NodeList;
			this.map(function(node){
				// FIXME: why would we ever get undefined here?
				query(queryStr, node).forEach(function(subNode){
					if(subNode !== undefined){
						ret.push(subNode);
					}
				});
			});
			return ret._stash(this);	// dojo.NodeList
		},

		filter: function(/*String|Function*/ filter){
			// summary:
			//		"masks" the built-in javascript filter() method (supported
			//		in Dojo via `dojo.filter`) to support passing a simple
			//		string filter in addition to supporting filtering function
			//		objects.
			// filter:
			//		If a string, a CSS rule like ".thinger" or "div > span".
			// example:
			//		"regular" JS filter syntax as exposed in dojo.filter:
			//		|	dojo.query("*").filter(function(item){
			//		|		// highlight every paragraph
			//		|		return (item.nodeName == "p");
			//		|	}).style("backgroundColor", "yellow");
			// example:
			//		the same filtering using a CSS selector
			//		|	dojo.query("*").filter("p").styles("backgroundColor", "yellow");

			var a = arguments, items = this, start = 0;
			if(typeof filter == "string"){ // inline'd type check
				items = query._filterResult(this, a[0]);
				if(a.length == 1){
					// if we only got a string query, pass back the filtered results
					return items._stash(this); // dojo.NodeList
				}
				// if we got a callback, run it over the filtered items
				start = 1;
			}
			return this._wrap(array.filter(items, a[start], a[start + 1]), this);	// dojo.NodeList
		},

		/*
		// FIXME: should this be "copyTo" and include parenting info?
		clone: function(){
			// summary:
			//		creates node clones of each element of this list
			//		and returns a new list containing the clones
		},
		*/

		addContent: function(/*String||DomNode||Object||dojo.NodeList*/ content, /*String||Integer?*/ position){
			// summary:
			//		add a node, NodeList or some HTML as a string to every item in the
			//		list.  Returns the original list.
			// description:
			//		a copy of the HTML content is added to each item in the
			//		list, with an optional position argument. If no position
			//		argument is provided, the content is appended to the end of
			//		each item.
			// content:
			//		DOM node, HTML in string format, a NodeList or an Object. If a DOM node or
			//		NodeList, the content will be cloned if the current NodeList has more than one
			//		element. Only the DOM nodes are cloned, no event handlers. If it is an Object,
			//		it should be an object with at "template" String property that has the HTML string
			//		to insert. If dojo.string has already been dojo.required, then dojo.string.substitute
			//		will be used on the "template" to generate the final HTML string. Other allowed
			//		properties on the object are: "parse" if the HTML
			//		string should be parsed for widgets (dojo.require("dojo.parser") to get that
			//		option to work), and "templateFunc" if a template function besides dojo.string.substitute
			//		should be used to transform the "template".
			// position:
			//		can be one of:
			//		|	"last"||"end" (default)
			//		|	"first||"start"
			//		|	"before"
			//		|	"after"
			//		|	"replace" (replaces nodes in this NodeList with new content)
			//		|	"only" (removes other children of the nodes so new content is the only child)
			//		or an offset in the childNodes property
			// example:
			//		appends content to the end if the position is omitted
			//	|	dojo.query("h3 > p").addContent("hey there!");
			// example:
			//		add something to the front of each element that has a
			//		"thinger" property:
			//	|	dojo.query("[thinger]").addContent("...", "first");
			// example:
			//		adds a header before each element of the list
			//	|	dojo.query(".note").addContent("<h4>NOTE:</h4>", "before");
			// example:
			//		add a clone of a DOM node to the end of every element in
			//		the list, removing it from its existing parent.
			//	|	dojo.query(".note").addContent(dojo.byId("foo"));
			// example:
			//		Append nodes from a templatized string.
			//		dojo.require("dojo.string");
			//		dojo.query(".note").addContent({
			//			template: '<b>${id}: </b><span>${name}</span>',
			//			id: "user332",
			//			name: "Mr. Anderson"
			//		});
			// example:
			//		Append nodes from a templatized string that also has widgets parsed.
			//		dojo.require("dojo.string");
			//		dojo.require("dojo.parser");
			//		var notes = dojo.query(".note").addContent({
			//			template: '<button dojoType="dijit.form.Button">${text}</button>',
			//			parse: true,
			//			text: "Send"
			//		});
			content = this._normalize(content, this[0]);
			for(var i = 0, node; (node = this[i]); i++){
				this._place(content, node, position, i > 0);
			}
			return this; //dojo.NodeList
		}
	});

	/*===== return dojo.NodeList; =====*/
	return NodeList;
});

},
'dojo/_base/connect':function(){
define(["./kernel", "../on", "../topic", "../aspect", "./event", "../mouse", "./sniff", "./lang", "../keys"], function(kernel, on, hub, aspect, eventModule, mouse, has, lang){
//  module:
//    dojo/_base/connect
//  summary:
//    This module defines the dojo.connect API.
//		This modules also provides keyboard event handling helpers.
//		This module exports an extension event for emulating Firefox's keypress handling.
//		However, this extension event exists primarily for backwards compatibility and
//		is not recommended. WebKit and IE uses an alternate keypress handling (only
//		firing for printable characters, to distinguish from keydown events), and most
//		consider the WebKit/IE behavior more desirable.
has.add("events-keypress-typed", function(){ // keypresses should only occur a printable character is hit
	var testKeyEvent = {charCode: 0};
	try{
		testKeyEvent = document.createEvent("KeyboardEvent");
		(testKeyEvent.initKeyboardEvent || testKeyEvent.initKeyEvent).call(testKeyEvent, "keypress", true, true, null, false, false, false, false, 9, 3);
	}catch(e){}
	return testKeyEvent.charCode == 0 && !has("opera");
});

function connect_(obj, event, context, method, dontFix){
	method = lang.hitch(context, method);
	if(!obj || !(obj.addEventListener || obj.attachEvent)){
		// it is a not a DOM node and we are using the dojo.connect style of treating a
		// method like an event, must go right to aspect
		return aspect.after(obj || kernel.global, event, method, true);
	}
	if(typeof event == "string" && event.substring(0, 2) == "on"){
		event = event.substring(2);
	}
	if(!obj){
		obj = kernel.global;
	}
	if(!dontFix){
		switch(event){
			// dojo.connect has special handling for these event types
			case "keypress":
				event = keypress;
				break;
			case "mouseenter":
				event = mouse.enter;
				break;
			case "mouseleave":
				event = mouse.leave;
				break;
		}
	}
	return on(obj, event, method, dontFix);
}

var _punctMap = {
	106:42,
	111:47,
	186:59,
	187:43,
	188:44,
	189:45,
	190:46,
	191:47,
	192:96,
	219:91,
	220:92,
	221:93,
	222:39,
	229:113
};
var evtCopyKey = has("mac") ? "metaKey" : "ctrlKey";


var _synthesizeEvent = function(evt, props){
	var faux = lang.mixin({}, evt, props);
	setKeyChar(faux);
	// FIXME: would prefer to use lang.hitch: lang.hitch(evt, evt.preventDefault);
	// but it throws an error when preventDefault is invoked on Safari
	// does Event.preventDefault not support "apply" on Safari?
	faux.preventDefault = function(){ evt.preventDefault(); };
	faux.stopPropagation = function(){ evt.stopPropagation(); };
	return faux;
};
function setKeyChar(evt){
	evt.keyChar = evt.charCode ? String.fromCharCode(evt.charCode) : '';
	evt.charOrCode = evt.keyChar || evt.keyCode;
}
var keypress;
if(has("events-keypress-typed")){
	// this emulates Firefox's keypress behavior where every keydown can correspond to a keypress
	var _trySetKeyCode = function(e, code){
		try{
			// squelch errors when keyCode is read-only
			// (e.g. if keyCode is ctrl or shift)
			return (e.keyCode = code);
		}catch(e){
			return 0;
		}
	};
	keypress = function(object, listener){
		var keydownSignal = on(object, "keydown", function(evt){
			// munge key/charCode
			var k=evt.keyCode;
			// These are Windows Virtual Key Codes
			// http://msdn.microsoft.com/library/default.asp?url=/library/en-us/winui/WinUI/WindowsUserInterface/UserInput/VirtualKeyCodes.asp
			var unprintable = (k!=13 || (has("ie") >= 9 && !has("quirks"))) && k!=32 && (k!=27||!has("ie")) && (k<48||k>90) && (k<96||k>111) && (k<186||k>192) && (k<219||k>222) && k!=229;
			// synthesize keypress for most unprintables and CTRL-keys
			if(unprintable||evt.ctrlKey){
				var c = unprintable ? 0 : k;
				if(evt.ctrlKey){
					if(k==3 || k==13){
						return listener.call(evt.currentTarget, evt); // IE will post CTRL-BREAK, CTRL-ENTER as keypress natively
					}else if(c>95 && c<106){
						c -= 48; // map CTRL-[numpad 0-9] to ASCII
					}else if((!evt.shiftKey)&&(c>=65&&c<=90)){
						c += 32; // map CTRL-[A-Z] to lowercase
					}else{
						c = _punctMap[c] || c; // map other problematic CTRL combinations to ASCII
					}
				}
				// simulate a keypress event
				var faux = _synthesizeEvent(evt, {type: 'keypress', faux: true, charCode: c});
				listener.call(evt.currentTarget, faux);
				if(has("ie")){
					_trySetKeyCode(evt, faux.keyCode);
				}
			}
		});
		var keypressSignal = on(object, "keypress", function(evt){
			var c = evt.charCode;
			c = c>=32 ? c : 0;
			evt = _synthesizeEvent(evt, {charCode: c, faux: true});
			return listener.call(this, evt);
		});
		return {
			remove: function(){
				keydownSignal.remove();
				keypressSignal.remove();
			}
		};
	};
}else{
	if(has("opera")){
		keypress = function(object, listener){
			return on(object, "keypress", function(evt){
				var c = evt.which;
				if(c==3){
					c=99; // Mozilla maps CTRL-BREAK to CTRL-c
				}
				// can't trap some keys at all, like INSERT and DELETE
				// there is no differentiating info between DELETE and ".", or INSERT and "-"
				c = c<32 && !evt.shiftKey ? 0 : c;
				if(evt.ctrlKey && !evt.shiftKey && c>=65 && c<=90){
					// lowercase CTRL-[A-Z] keys
					c += 32;
				}
				return listener.call(this, _synthesizeEvent(evt, { charCode: c }));
			});
		};
	}else{
		keypress = function(object, listener){
			return on(object, "keypress", function(evt){
				setKeyChar(evt);
				return listener.call(this, evt);
			});
		};
	}
}

var connect = {
	_keypress:keypress,

	connect:function(obj, event, context, method, dontFix){
		// normalize arguments
		var a=arguments, args=[], i=0;
		// if a[0] is a String, obj was omitted
		args.push(typeof a[0] == "string" ? null : a[i++], a[i++]);
		// if the arg-after-next is a String or Function, context was NOT omitted
		var a1 = a[i+1];
		args.push(typeof a1 == "string" || typeof a1 == "function" ? a[i++] : null, a[i++]);
		// absorb any additional arguments
		for(var l=a.length; i<l; i++){	args.push(a[i]); }
		return connect_.apply(this, args);
	},

	disconnect:function(handle){
		if(handle){
			handle.remove();
		}
	},

	subscribe:function(topic, context, method){
		return hub.subscribe(topic, lang.hitch(context, method));
	},

	publish:function(topic, args){
		return hub.publish.apply(hub, [topic].concat(args));
	},

	connectPublisher:function(topic, obj, event){
		var pf = function(){ connect.publish(topic, arguments); };
		return event ? connect.connect(obj, event, pf) : connect.connect(obj, pf); //Handle
	},

	isCopyKey: function(e){
		return e[evtCopyKey];	// Boolean
	}
};
connect.unsubscribe = connect.disconnect;

1 && lang.mixin(kernel, connect);
return connect;

/*=====
dojo.connect = function(obj, event, context, method, dontFix){
	// summary:
	//		`dojo.connect` is the core event handling and delegation method in
	//		Dojo. It allows one function to "listen in" on the execution of
	//		any other, triggering the second whenever the first is called. Many
	//		listeners may be attached to a function, and source functions may
	//		be either regular function calls or DOM events.
	//
	// description:
	//		Connects listeners to actions, so that after event fires, a
	//		listener is called with the same arguments passed to the original
	//		function.
	//
	//		Since `dojo.connect` allows the source of events to be either a
	//		"regular" JavaScript function or a DOM event, it provides a uniform
	//		interface for listening to all the types of events that an
	//		application is likely to deal with though a single, unified
	//		interface. DOM programmers may want to think of it as
	//		"addEventListener for everything and anything".
	//
	//		When setting up a connection, the `event` parameter must be a
	//		string that is the name of the method/event to be listened for. If
	//		`obj` is null, `kernel.global` is assumed, meaning that connections
	//		to global methods are supported but also that you may inadvertently
	//		connect to a global by passing an incorrect object name or invalid
	//		reference.
	//
	//		`dojo.connect` generally is forgiving. If you pass the name of a
	//		function or method that does not yet exist on `obj`, connect will
	//		not fail, but will instead set up a stub method. Similarly, null
	//		arguments may simply be omitted such that fewer than 4 arguments
	//		may be required to set up a connection See the examples for details.
	//
	//		The return value is a handle that is needed to
	//		remove this connection with `dojo.disconnect`.
	//
	// obj: Object|null:
	//		The source object for the event function.
	//		Defaults to `kernel.global` if null.
	//		If obj is a DOM node, the connection is delegated
	//		to the DOM event manager (unless dontFix is true).
	//
	// event: String:
	//		String name of the event function in obj.
	//		I.e. identifies a property `obj[event]`.
	//
	// context: Object|null
	//		The object that method will receive as "this".
	//
	//		If context is null and method is a function, then method
	//		inherits the context of event.
	//
	//		If method is a string then context must be the source
	//		object object for method (context[method]). If context is null,
	//		kernel.global is used.
	//
	// method: String|Function:
	//		A function reference, or name of a function in context.
	//		The function identified by method fires after event does.
	//		method receives the same arguments as the event.
	//		See context argument comments for information on method's scope.
	//
	// dontFix: Boolean?
	//		If obj is a DOM node, set dontFix to true to prevent delegation
	//		of this connection to the DOM event manager.
	//
	// example:
	//		When obj.onchange(), do ui.update():
	//	|	dojo.connect(obj, "onchange", ui, "update");
	//	|	dojo.connect(obj, "onchange", ui, ui.update); // same
	//
	// example:
	//		Using return value for disconnect:
	//	|	var link = dojo.connect(obj, "onchange", ui, "update");
	//	|	...
	//	|	dojo.disconnect(link);
	//
	// example:
	//		When onglobalevent executes, watcher.handler is invoked:
	//	|	dojo.connect(null, "onglobalevent", watcher, "handler");
	//
	// example:
	//		When ob.onCustomEvent executes, customEventHandler is invoked:
	//	|	dojo.connect(ob, "onCustomEvent", null, "customEventHandler");
	//	|	dojo.connect(ob, "onCustomEvent", "customEventHandler"); // same
	//
	// example:
	//		When ob.onCustomEvent executes, customEventHandler is invoked
	//		with the same scope (this):
	//	|	dojo.connect(ob, "onCustomEvent", null, customEventHandler);
	//	|	dojo.connect(ob, "onCustomEvent", customEventHandler); // same
	//
	// example:
	//		When globalEvent executes, globalHandler is invoked
	//		with the same scope (this):
	//	|	dojo.connect(null, "globalEvent", null, globalHandler);
	//	|	dojo.connect("globalEvent", globalHandler); // same
}
=====*/

/*=====
dojo.disconnect = function(handle){
	// summary:
	//		Remove a link created by dojo.connect.
	// description:
	//		Removes the connection between event and the method referenced by handle.
	// handle: Handle:
	//		the return value of the dojo.connect call that created the connection.
}
=====*/

/*=====
dojo.subscribe = function(topic, context, method){
	//	summary:
	//		Attach a listener to a named topic. The listener function is invoked whenever the
	//		named topic is published (see: dojo.publish).
	//		Returns a handle which is needed to unsubscribe this listener.
	//	topic: String:
	//		The topic to which to subscribe.
	//	context: Object|null:
	//		Scope in which method will be invoked, or null for default scope.
	//	method: String|Function:
	//		The name of a function in context, or a function reference. This is the function that
	//		is invoked when topic is published.
	//	example:
	//	|	dojo.subscribe("alerts", null, function(caption, message){ alert(caption + "\n" + message); });
	//	|	dojo.publish("alerts", [ "read this", "hello world" ]);
}
=====*/

/*=====
dojo.unsubscribe = function(handle){
	//	summary:
	//		Remove a topic listener.
	//	handle: Handle
	//		The handle returned from a call to subscribe.
	//	example:
	//	|	var alerter = dojo.subscribe("alerts", null, function(caption, message){ alert(caption + "\n" + message); };
	//	|	...
	//	|	dojo.unsubscribe(alerter);
}
=====*/

/*=====
dojo.publish = function(topic, args){
	//	summary:
	//		Invoke all listener method subscribed to topic.
	//	topic: String:
	//		The name of the topic to publish.
	//	args: Array?
	//		An array of arguments. The arguments will be applied
	//		to each topic subscriber (as first class parameters, via apply).
	//	example:
	//	|	dojo.subscribe("alerts", null, function(caption, message){ alert(caption + "\n" + message); };
	//	|	dojo.publish("alerts", [ "read this", "hello world" ]);
}
=====*/

/*=====
dojo.connectPublisher = function(topic, obj, event){
	//	summary:
	//		Ensure that every time obj.event() is called, a message is published
	//		on the topic. Returns a handle which can be passed to
	//		dojo.disconnect() to disable subsequent automatic publication on
	//		the topic.
	//	topic: String:
	//		The name of the topic to publish.
	//	obj: Object|null:
	//		The source object for the event function. Defaults to kernel.global
	//		if null.
	//	event: String:
	//		The name of the event function in obj.
	//		I.e. identifies a property obj[event].
	//	example:
	//	|	dojo.connectPublisher("/ajax/start", dojo, "xhrGet");
}
=====*/

/*=====
dojo.isCopyKey = function(e){
	// summary:
	//		Checks an event for the copy key (meta on Mac, and ctrl anywhere else)
	// e: Event
	//		Event object to examine
}
=====*/

});



},
'dojo/_base/fx':function(){
define(["./kernel", "./lang", "../Evented", "./Color", "./connect", "./sniff", "../dom", "../dom-style"], function(dojo, lang, Evented, Color, connect, has, dom, style){
	// module:
	//		dojo/_base/fx
	// summary:
	//		This module defines the base dojo.fx implementation.
	// notes:
	//		Animation loosely package based on Dan Pupius' work, contributed under CLA; see
	//		http://pupius.co.uk/js/Toolkit.Drawing.js

	var _mixin = lang.mixin;

	dojo._Line = function(/*int*/ start, /*int*/ end){
		//	summary:
		//		dojo._Line is the object used to generate values from a start value
		//		to an end value
		//	start: int
		//		Beginning value for range
		//	end: int
		//		Ending value for range
		this.start = start;
		this.end = end;
	};

	dojo._Line.prototype.getValue = function(/*float*/ n){
		//	summary: Returns the point on the line
		//	n: a floating point number greater than 0 and less than 1
		return ((this.end - this.start) * n) + this.start; // Decimal
	};

	dojo.Animation = function(args){
		//	summary:
		//		A generic animation class that fires callbacks into its handlers
		//		object at various states.
		//	description:
		//		A generic animation class that fires callbacks into its handlers
		//		object at various states. Nearly all dojo animation functions
		//		return an instance of this method, usually without calling the
		//		.play() method beforehand. Therefore, you will likely need to
		//		call .play() on instances of `dojo.Animation` when one is
		//		returned.
		// args: Object
		//		The 'magic argument', mixing all the properties into this
		//		animation instance.

		_mixin(this, args);
		if(lang.isArray(this.curve)){
			this.curve = new dojo._Line(this.curve[0], this.curve[1]);
		}

	};
	dojo.Animation.prototype = new Evented();
	// Alias to drop come 2.0:
	dojo._Animation = dojo.Animation;

	lang.extend(dojo.Animation, {
		// duration: Integer
		//		The time in milliseonds the animation will take to run
		duration: 350,

	/*=====
		// curve: dojo._Line|Array
		//		A two element array of start and end values, or a `dojo._Line` instance to be
		//		used in the Animation.
		curve: null,

		// easing: Function?
		//		A Function to adjust the acceleration (or deceleration) of the progress
		//		across a dojo._Line
		easing: null,
	=====*/

		// repeat: Integer?
		//		The number of times to loop the animation
		repeat: 0,

		// rate: Integer?
		//		the time in milliseconds to wait before advancing to next frame
		//		(used as a fps timer: 1000/rate = fps)
		rate: 20 /* 50 fps */,

	/*=====
		// delay: Integer?
		//		The time in milliseconds to wait before starting animation after it
		//		has been .play()'ed
		delay: null,

		// beforeBegin: Event?
		//		Synthetic event fired before a dojo.Animation begins playing (synchronous)
		beforeBegin: null,

		// onBegin: Event?
		//		Synthetic event fired as a dojo.Animation begins playing (useful?)
		onBegin: null,

		// onAnimate: Event?
		//		Synthetic event fired at each interval of a `dojo.Animation`
		onAnimate: null,

		// onEnd: Event?
		//		Synthetic event fired after the final frame of a `dojo.Animation`
		onEnd: null,

		// onPlay: Event?
		//		Synthetic event fired any time a `dojo.Animation` is play()'ed
		onPlay: null,

		// onPause: Event?
		//		Synthetic event fired when a `dojo.Animation` is paused
		onPause: null,

		// onStop: Event
		//		Synthetic event fires when a `dojo.Animation` is stopped
		onStop: null,

	=====*/

		_percent: 0,
		_startRepeatCount: 0,

		_getStep: function(){
			var _p = this._percent,
				_e = this.easing
			;
			return _e ? _e(_p) : _p;
		},
		_fire: function(/*Event*/ evt, /*Array?*/ args){
			//	summary:
			//		Convenience function.  Fire event "evt" and pass it the
			//		arguments specified in "args".
			//	description:
			//		Convenience function.  Fire event "evt" and pass it the
			//		arguments specified in "args".
			//		Fires the callback in the scope of the `dojo.Animation`
			//		instance.
			//	evt:
			//		The event to fire.
			//	args:
			//		The arguments to pass to the event.
			var a = args||[];
			if(this[evt]){
				if(dojo.config.debugAtAllCosts){
					this[evt].apply(this, a);
				}else{
					try{
						this[evt].apply(this, a);
					}catch(e){
						// squelch and log because we shouldn't allow exceptions in
						// synthetic event handlers to cause the internal timer to run
						// amuck, potentially pegging the CPU. I'm not a fan of this
						// squelch, but hopefully logging will make it clear what's
						// going on
						console.error("exception in animation handler for:", evt);
						console.error(e);
					}
				}
			}
			return this; // dojo.Animation
		},

		play: function(/*int?*/ delay, /*Boolean?*/ gotoStart){
			// summary:
			//		Start the animation.
			// delay:
			//		How many milliseconds to delay before starting.
			// gotoStart:
			//		If true, starts the animation from the beginning; otherwise,
			//		starts it from its current position.
			// returns: dojo.Animation
			//		The instance to allow chaining.

			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			if(gotoStart){
				_t._stopTimer();
				_t._active = _t._paused = false;
				_t._percent = 0;
			}else if(_t._active && !_t._paused){
				return _t;
			}

			_t._fire("beforeBegin", [_t.node]);

			var de = delay || _t.delay,
				_p = lang.hitch(_t, "_play", gotoStart);

			if(de > 0){
				_t._delayTimer = setTimeout(_p, de);
				return _t;
			}
			_p();
			return _t;	// dojo.Animation
		},

		_play: function(gotoStart){
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			_t._startTime = new Date().valueOf();
			if(_t._paused){
				_t._startTime -= _t.duration * _t._percent;
			}

			_t._active = true;
			_t._paused = false;
			var value = _t.curve.getValue(_t._getStep());
			if(!_t._percent){
				if(!_t._startRepeatCount){
					_t._startRepeatCount = _t.repeat;
				}
				_t._fire("onBegin", [value]);
			}

			_t._fire("onPlay", [value]);

			_t._cycle();
			return _t; // dojo.Animation
		},

		pause: function(){
			// summary: Pauses a running animation.
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			_t._stopTimer();
			if(!_t._active){ return _t; /*dojo.Animation*/ }
			_t._paused = true;
			_t._fire("onPause", [_t.curve.getValue(_t._getStep())]);
			return _t; // dojo.Animation
		},

		gotoPercent: function(/*Decimal*/ percent, /*Boolean?*/ andPlay){
			//	summary:
			//		Sets the progress of the animation.
			//	percent:
			//		A percentage in decimal notation (between and including 0.0 and 1.0).
			//	andPlay:
			//		If true, play the animation after setting the progress.
			var _t = this;
			_t._stopTimer();
			_t._active = _t._paused = true;
			_t._percent = percent;
			if(andPlay){ _t.play(); }
			return _t; // dojo.Animation
		},

		stop: function(/*boolean?*/ gotoEnd){
			// summary: Stops a running animation.
			// gotoEnd: If true, the animation will end.
			var _t = this;
			if(_t._delayTimer){ _t._clearTimer(); }
			if(!_t._timer){ return _t; /* dojo.Animation */ }
			_t._stopTimer();
			if(gotoEnd){
				_t._percent = 1;
			}
			_t._fire("onStop", [_t.curve.getValue(_t._getStep())]);
			_t._active = _t._paused = false;
			return _t; // dojo.Animation
		},

		status: function(){
			// summary:
			//		Returns a string token representation of the status of
			//		the animation, one of: "paused", "playing", "stopped"
			if(this._active){
				return this._paused ? "paused" : "playing"; // String
			}
			return "stopped"; // String
		},

		_cycle: function(){
			var _t = this;
			if(_t._active){
				var curr = new Date().valueOf();
				var step = (curr - _t._startTime) / (_t.duration);

				if(step >= 1){
					step = 1;
				}
				_t._percent = step;

				// Perform easing
				if(_t.easing){
					step = _t.easing(step);
				}

				_t._fire("onAnimate", [_t.curve.getValue(step)]);

				if(_t._percent < 1){
					_t._startTimer();
				}else{
					_t._active = false;

					if(_t.repeat > 0){
						_t.repeat--;
						_t.play(null, true);
					}else if(_t.repeat == -1){
						_t.play(null, true);
					}else{
						if(_t._startRepeatCount){
							_t.repeat = _t._startRepeatCount;
							_t._startRepeatCount = 0;
						}
					}
					_t._percent = 0;
					_t._fire("onEnd", [_t.node]);
					!_t.repeat && _t._stopTimer();
				}
			}
			return _t; // dojo.Animation
		},

		_clearTimer: function(){
			// summary: Clear the play delay timer
			clearTimeout(this._delayTimer);
			delete this._delayTimer;
		}

	});

	// the local timer, stubbed into all Animation instances
	var ctr = 0,
		timer = null,
		runner = {
			run: function(){}
		};

	lang.extend(dojo.Animation, {

		_startTimer: function(){
			if(!this._timer){
				this._timer = connect.connect(runner, "run", this, "_cycle");
				ctr++;
			}
			if(!timer){
				timer = setInterval(lang.hitch(runner, "run"), this.rate);
			}
		},

		_stopTimer: function(){
			if(this._timer){
				connect.disconnect(this._timer);
				this._timer = null;
				ctr--;
			}
			if(ctr <= 0){
				clearInterval(timer);
				timer = null;
				ctr = 0;
			}
		}

	});

	var _makeFadeable =
				has("ie") ? function(node){
			// only set the zoom if the "tickle" value would be the same as the
			// default
			var ns = node.style;
			// don't set the width to auto if it didn't already cascade that way.
			// We don't want to f anyones designs
			if(!ns.width.length && style.get(node, "width") == "auto"){
				ns.width = "auto";
			}
		} :
				function(){};

	dojo._fade = function(/*Object*/ args){
		//	summary:
		//		Returns an animation that will fade the node defined by
		//		args.node from the start to end values passed (args.start
		//		args.end) (end is mandatory, start is optional)

		args.node = dom.byId(args.node);
		var fArgs = _mixin({ properties: {} }, args),
			props = (fArgs.properties.opacity = {});

		props.start = !("start" in fArgs) ?
			function(){
				return +style.get(fArgs.node, "opacity")||0;
			} : fArgs.start;
		props.end = fArgs.end;

		var anim = dojo.animateProperty(fArgs);
		connect.connect(anim, "beforeBegin", lang.partial(_makeFadeable, fArgs.node));

		return anim; // dojo.Animation
	};

	/*=====
	dojo.__FadeArgs = function(node, duration, easing){
		//	node: DOMNode|String
		//		The node referenced in the animation
		//	duration: Integer?
		//		Duration of the animation in milliseconds.
		//	easing: Function?
		//		An easing function.
		this.node = node;
		this.duration = duration;
		this.easing = easing;
	}
	=====*/

	dojo.fadeIn = function(/*dojo.__FadeArgs*/ args){
		// summary:
		//		Returns an animation that will fade node defined in 'args' from
		//		its current opacity to fully opaque.
		return dojo._fade(_mixin({ end: 1 }, args)); // dojo.Animation
	};

	dojo.fadeOut = function(/*dojo.__FadeArgs*/ args){
		// summary:
		//		Returns an animation that will fade node defined in 'args'
		//		from its current opacity to fully transparent.
		return dojo._fade(_mixin({ end: 0 }, args)); // dojo.Animation
	};

	dojo._defaultEasing = function(/*Decimal?*/ n){
		// summary: The default easing function for dojo.Animation(s)
		return 0.5 + ((Math.sin((n + 1.5) * Math.PI)) / 2);	// Decimal
	};

	var PropLine = function(properties){
		// PropLine is an internal class which is used to model the values of
		// an a group of CSS properties across an animation lifecycle. In
		// particular, the "getValue" function handles getting interpolated
		// values between start and end for a particular CSS value.
		this._properties = properties;
		for(var p in properties){
			var prop = properties[p];
			if(prop.start instanceof Color){
				// create a reusable temp color object to keep intermediate results
				prop.tempColor = new Color();
			}
		}
	};

	PropLine.prototype.getValue = function(r){
		var ret = {};
		for(var p in this._properties){
			var prop = this._properties[p],
				start = prop.start;
			if(start instanceof Color){
				ret[p] = Color.blendColors(start, prop.end, r, prop.tempColor).toCss();
			}else if(!lang.isArray(start)){
				ret[p] = ((prop.end - start) * r) + start + (p != "opacity" ? prop.units || "px" : 0);
			}
		}
		return ret;
	};

	/*=====
	dojo.declare("dojo.__AnimArgs", [dojo.__FadeArgs], {
		// Properties: Object?
		//	A hash map of style properties to Objects describing the transition,
		//	such as the properties of dojo._Line with an additional 'units' property
		properties: {}

		//TODOC: add event callbacks
	});
	=====*/

	dojo.animateProperty = function(/*dojo.__AnimArgs*/ args){
		// summary:
		//		Returns an animation that will transition the properties of
		//		node defined in `args` depending how they are defined in
		//		`args.properties`
		//
		// description:
		//		`dojo.animateProperty` is the foundation of most `dojo.fx`
		//		animations. It takes an object of "properties" corresponding to
		//		style properties, and animates them in parallel over a set
		//		duration.
		//
		// example:
		//		A simple animation that changes the width of the specified node.
		//	|	dojo.animateProperty({
		//	|		node: "nodeId",
		//	|		properties: { width: 400 },
		//	|	}).play();
		//		Dojo figures out the start value for the width and converts the
		//		integer specified for the width to the more expressive but
		//		verbose form `{ width: { end: '400', units: 'px' } }` which you
		//		can also specify directly. Defaults to 'px' if ommitted.
		//
		// example:
		//		Animate width, height, and padding over 2 seconds... the
		//		pedantic way:
		//	|	dojo.animateProperty({ node: node, duration:2000,
		//	|		properties: {
		//	|			width: { start: '200', end: '400', units:"px" },
		//	|			height: { start:'200', end: '400', units:"px" },
		//	|			paddingTop: { start:'5', end:'50', units:"px" }
		//	|		}
		//	|	}).play();
		//		Note 'paddingTop' is used over 'padding-top'. Multi-name CSS properties
		//		are written using "mixed case", as the hyphen is illegal as an object key.
		//
		// example:
		//		Plug in a different easing function and register a callback for
		//		when the animation ends. Easing functions accept values between
		//		zero and one and return a value on that basis. In this case, an
		//		exponential-in curve.
		//	|	dojo.animateProperty({
		//	|		node: "nodeId",
		//	|		// dojo figures out the start value
		//	|		properties: { width: { end: 400 } },
		//	|		easing: function(n){
		//	|			return (n==0) ? 0 : Math.pow(2, 10 * (n - 1));
		//	|		},
		//	|		onEnd: function(node){
		//	|			// called when the animation finishes. The animation
		//	|			// target is passed to this function
		//	|		}
		//	|	}).play(500); // delay playing half a second
		//
		// example:
		//		Like all `dojo.Animation`s, animateProperty returns a handle to the
		//		Animation instance, which fires the events common to Dojo FX. Use `dojo.connect`
		//		to access these events outside of the Animation definiton:
		//	|	var anim = dojo.animateProperty({
		//	|		node:"someId",
		//	|		properties:{
		//	|			width:400, height:500
		//	|		}
		//	|	});
		//	|	dojo.connect(anim,"onEnd", function(){
		//	|		console.log("animation ended");
		//	|	});
		//	|	// play the animation now:
		//	|	anim.play();
		//
		// example:
		//		Each property can be a function whose return value is substituted along.
		//		Additionally, each measurement (eg: start, end) can be a function. The node
		//		reference is passed direcly to callbacks.
		//	|	dojo.animateProperty({
		//	|		node:"mine",
		//	|		properties:{
		//	|			height:function(node){
		//	|				// shrink this node by 50%
		//	|				return dojo.position(node).h / 2
		//	|			},
		//	|			width:{
		//	|				start:function(node){ return 100; },
		//	|				end:function(node){ return 200; }
		//	|			}
		//	|		}
		//	|	}).play();
		//

		var n = args.node = dom.byId(args.node);
		if(!args.easing){ args.easing = dojo._defaultEasing; }

		var anim = new dojo.Animation(args);
		connect.connect(anim, "beforeBegin", anim, function(){
			var pm = {};
			for(var p in this.properties){
				// Make shallow copy of properties into pm because we overwrite
				// some values below. In particular if start/end are functions
				// we don't want to overwrite them or the functions won't be
				// called if the animation is reused.
				if(p == "width" || p == "height"){
					this.node.display = "block";
				}
				var prop = this.properties[p];
				if(lang.isFunction(prop)){
					prop = prop(n);
				}
				prop = pm[p] = _mixin({}, (lang.isObject(prop) ? prop: { end: prop }));

				if(lang.isFunction(prop.start)){
					prop.start = prop.start(n);
				}
				if(lang.isFunction(prop.end)){
					prop.end = prop.end(n);
				}
				var isColor = (p.toLowerCase().indexOf("color") >= 0);
				function getStyle(node, p){
					// dojo.style(node, "height") can return "auto" or "" on IE; this is more reliable:
					var v = { height: node.offsetHeight, width: node.offsetWidth }[p];
					if(v !== undefined){ return v; }
					v = style.get(node, p);
					return (p == "opacity") ? +v : (isColor ? v : parseFloat(v));
				}
				if(!("end" in prop)){
					prop.end = getStyle(n, p);
				}else if(!("start" in prop)){
					prop.start = getStyle(n, p);
				}

				if(isColor){
					prop.start = new Color(prop.start);
					prop.end = new Color(prop.end);
				}else{
					prop.start = (p == "opacity") ? +prop.start : parseFloat(prop.start);
				}
			}
			this.curve = new PropLine(pm);
		});
		connect.connect(anim, "onAnimate", lang.hitch(style, "set", anim.node));
		return anim; // dojo.Animation
	};

	dojo.anim = function(	/*DOMNode|String*/	node,
							/*Object*/			properties,
							/*Integer?*/		duration,
							/*Function?*/		easing,
							/*Function?*/		onEnd,
							/*Integer?*/		delay){
		//	summary:
		//		A simpler interface to `dojo.animateProperty()`, also returns
		//		an instance of `dojo.Animation` but begins the animation
		//		immediately, unlike nearly every other Dojo animation API.
		//	description:
		//		`dojo.anim` is a simpler (but somewhat less powerful) version
		//		of `dojo.animateProperty`.  It uses defaults for many basic properties
		//		and allows for positional parameters to be used in place of the
		//		packed "property bag" which is used for other Dojo animation
		//		methods.
		//
		//		The `dojo.Animation` object returned from `dojo.anim` will be
		//		already playing when it is returned from this function, so
		//		calling play() on it again is (usually) a no-op.
		//	node:
		//		a DOM node or the id of a node to animate CSS properties on
		//	duration:
		//		The number of milliseconds over which the animation
		//		should run. Defaults to the global animation default duration
		//		(350ms).
		//	easing:
		//		An easing function over which to calculate acceleration
		//		and deceleration of the animation through its duration.
		//		A default easing algorithm is provided, but you may
		//		plug in any you wish. A large selection of easing algorithms
		//		are available in `dojo.fx.easing`.
		//	onEnd:
		//		A function to be called when the animation finishes
		//		running.
		//	delay:
		//		The number of milliseconds to delay beginning the
		//		animation by. The default is 0.
		//	example:
		//		Fade out a node
		//	|	dojo.anim("id", { opacity: 0 });
		//	example:
		//		Fade out a node over a full second
		//	|	dojo.anim("id", { opacity: 0 }, 1000);
		return dojo.animateProperty({ // dojo.Animation
			node: node,
			duration: duration || dojo.Animation.prototype.duration,
			properties: properties,
			easing: easing,
			onEnd: onEnd
		}).play(delay || 0);
	};

	return {
		_Line: dojo._Line,
		Animation: dojo.Animation,
		_fade: dojo._fade,
		fadeIn: dojo.fadeIn,
		fadeOut: dojo.fadeOut,
		_defaultEasing: dojo._defaultEasing,
		animateProperty: dojo.animateProperty,
		anim: dojo.anim
	};
});

},
'dojo/_base/config':function(){
define(["../has", "require"], function(has, require){
	// module:
	//		dojo/_base/config
	// summary:
	//		This module defines the user configuration during bootstrap.
	// description:
	//		By defining user configuration as a module value, an entire configuration can be specified in a build,
    //		thereby eliminating the need for sniffing and or explicitly setting in the global variable dojoConfig.
    //		Also, when multiple instances of dojo exist in a single application, each will necessarily be located
	//		at an unique absolute module identifier as given by the package configuration. Implementing configuration
	//		as a module allows for specifying unique, per-instance configurations.
	// example:
	//		Create a second instance of dojo with a different, instance-uniqe configuration (assume the loader and
	//		dojo.js are already loaded).
	//		|	// specify a configuration that creates a new instance of dojo at the absolute module identifier "myDojo"
	//		|	require({
	//		|		packages:[{
	//		|			name:"myDojo",
	//		|			location:".", //assume baseUrl points to dojo.js
	//		|	    }]
	//		|	});
	//		|
	//		|	// specify a configuration for the myDojo instance
	//		|	define("myDojo/config", {
	//		|		// normal configuration variables go here, e.g.,
	//		|		locale:"fr-ca"
	//		|	});
	//		|
	//		|	// load and use the new instance of dojo
	//		|	require(["myDojo"], function(dojo) {
	//		|		// dojo is the new instance of dojo
	//		|		// use as required
	//		|	});

	var result = {};
	if(1){
		// must be the dojo loader; take a shallow copy of require.rawConfig
		var src = require.rawConfig, p;
		for(p in src){
			result[p] = src[p];
		}
	}else{
		var adviseHas = function(featureSet, prefix, booting){
			for(p in featureSet){
				p!="has" && has.add(prefix + p, featureSet[p], 0, booting);
			}
		};
		result = 1 ?
			// must be a built version of the dojo loader; all config stuffed in require.rawConfig
			require.rawConfig :
			// a foreign loader
			this.dojoConfig || this.djConfig || {};
		adviseHas(result, "config", 1);
		adviseHas(result.has, "", 1);
	}
	return result;

/*=====
// note:
//		'dojoConfig' does not exist under 'dojo.*' so that it can be set before the
//		'dojo' variable exists.
// note:
//		Setting any of these variables *after* the library has loaded does
//		nothing at all.

// FIXME: can we document these on dojo.config object and explain they must be set via djConfig/dojoConfig global prior to loading dojo.js

dojoConfig = {
	// summary:
	//		Application code can set the global 'dojoConfig' prior to loading
	//		the library to control certain global settings for how dojo works.
	//
	// isDebug: Boolean
	//		Defaults to `false`. If set to `true`, ensures that Dojo provides
	//		extended debugging feedback via Firebug. If Firebug is not available
	//		on your platform, setting `isDebug` to `true` will force Dojo to
	//		pull in (and display) the version of Firebug Lite which is
	//		integrated into the Dojo distribution, thereby always providing a
	//		debugging/logging console when `isDebug` is enabled. Note that
	//		Firebug's `console.*` methods are ALWAYS defined by Dojo. If
	//		`isDebug` is false and you are on a platform without Firebug, these
	//		methods will be defined as no-ops.
	isDebug: false,
	// locale: String
	//		The locale to assume for loading localized resources in this page,
	//		specified according to [RFC 3066](http://www.ietf.org/rfc/rfc3066.txt).
	//		Must be specified entirely in lowercase, e.g. `en-us` and `zh-cn`.
	//		See the documentation for `dojo.i18n` and `dojo.requireLocalization`
	//		for details on loading localized resources. If no locale is specified,
	//		Dojo assumes the locale of the user agent, according to `navigator.userLanguage`
	//		or `navigator.language` properties.
	locale: undefined,
	// extraLocale: Array
	//		No default value. Specifies additional locales whose
	//		resources should also be loaded alongside the default locale when
	//		calls to `dojo.requireLocalization()` are processed.
	extraLocale: undefined,
	// baseUrl: String
	//		The directory in which `dojo.js` is located. Under normal
	//		conditions, Dojo auto-detects the correct location from which it
	//		was loaded. You may need to manually configure `baseUrl` in cases
	//		where you have renamed `dojo.js` or in which `<base>` tags confuse
	//		some browsers (e.g. IE 6). The variable `dojo.baseUrl` is assigned
	//		either the value of `djConfig.baseUrl` if one is provided or the
	//		auto-detected root if not. Other modules are located relative to
	//		this path. The path should end in a slash.
	baseUrl: undefined,
	// modulePaths: Object
	//		A map of module names to paths relative to `dojo.baseUrl`. The
	//		key/value pairs correspond directly to the arguments which
	//		`dojo.registerModulePath` accepts. Specifiying
	//		`djConfig.modulePaths = { "foo": "../../bar" }` is the equivalent
	//		of calling `dojo.registerModulePath("foo", "../../bar");`. Multiple
	//		modules may be configured via `djConfig.modulePaths`.
	modulePaths: {},
	// afterOnLoad: Boolean
	//		Indicates Dojo was added to the page after the page load. In this case
	//		Dojo will not wait for the page DOMContentLoad/load events and fire
	//		its dojo.addOnLoad callbacks after making sure all outstanding
	//		dojo.required modules have loaded. Only works with a built dojo.js,
	//		it does not work the dojo.js directly from source control.
	afterOnLoad: false,
	// addOnLoad: Function or Array
	//		Adds a callback via dojo.addOnLoad. Useful when Dojo is added after
	//		the page loads and djConfig.afterOnLoad is true. Supports the same
	//		arguments as dojo.addOnLoad. When using a function reference, use
	//		`djConfig.addOnLoad = function(){};`. For object with function name use
	//		`djConfig.addOnLoad = [myObject, "functionName"];` and for object with
	//		function reference use
	//		`djConfig.addOnLoad = [myObject, function(){}];`
	addOnLoad: null,
	// require: Array
	//		An array of module names to be loaded immediately after dojo.js has been included
	//		in a page.
	require: [],
	// defaultDuration: Array
	//		Default duration, in milliseconds, for wipe and fade animations within dijits.
	//		Assigned to dijit.defaultDuration.
	defaultDuration: 200,
	// dojoBlankHtmlUrl: String
	//		Used by some modules to configure an empty iframe. Used by dojo.io.iframe and
	//		dojo.back, and dijit popup support in IE where an iframe is needed to make sure native
	//		controls do not bleed through the popups. Normally this configuration variable
	//		does not need to be set, except when using cross-domain/CDN Dojo builds.
	//		Save dojo/resources/blank.html to your domain and set `djConfig.dojoBlankHtmlUrl`
	//		to the path on your domain your copy of blank.html.
	dojoBlankHtmlUrl: undefined,
	//	ioPublish: Boolean?
	//		Set this to true to enable publishing of topics for the different phases of
	//		IO operations. Publishing is done via dojo.publish. See dojo.__IoPublish for a list
	//		of topics that are published.
	ioPublish: false,
	//	useCustomLogger: Anything?
	//		If set to a value that evaluates to true such as a string or array and
	//		isDebug is true and Firebug is not available or running, then it bypasses
	//		the creation of Firebug Lite allowing you to define your own console object.
	useCustomLogger: undefined,
	// transparentColor: Array
	//		Array containing the r, g, b components used as transparent color in dojo.Color;
	//		if undefined, [255,255,255] (white) will be used.
	transparentColor: undefined,
	// skipIeDomLoaded: Boolean
	//		For IE only, skip the DOMContentLoaded hack used. Sometimes it can cause an Operation
	//		Aborted error if the rest of the page triggers script defers before the DOM is ready.
	//		If this is config value is set to true, then dojo.addOnLoad callbacks will not be
	//		triggered until the page load event, which is after images and iframes load. If you
	//		want to trigger the callbacks sooner, you can put a script block in the bottom of
	//		your HTML that calls dojo._loadInit();. If you are using multiversion support, change
	//		"dojo." to the appropriate scope name for dojo.
	skipIeDomLoaded: false
}
=====*/
});


},
'dojo/_base/unload':function(){
define(["./kernel", "./connect"], function(dojo, connect) {
	// module:
	//		dojo/unload
	// summary:
	//		This module contains the document and window unload detection API.

	var win = window;

	/*=====
		dojo.windowUnloaded = function(){
			// summary:
			//		signal fired by impending window destruction. You may use
			//		dojo.addOnWindowUnload() to register a listener for this
			//		event. NOTE: if you wish to dojo.connect() to this method
			//		to perform page/application cleanup, be aware that this
			//		event WILL NOT fire if no handler has been registered with
			//		dojo.addOnWindowUnload. This behavior started in Dojo 1.3.
			//		Previous versions always triggered dojo.windowUnloaded. See
			//		dojo.addOnWindowUnload for more info.
		};
	=====*/

	dojo.addOnWindowUnload = function(/*Object?|Function?*/obj, /*String|Function?*/functionName){
		// summary:
		//		registers a function to be triggered when window.onunload
		//		fires.
		//	description:
		//		The first time that addOnWindowUnload is called Dojo
		//		will register a page listener to trigger your unload
		//		handler with. Note that registering these handlers may
		//		destory "fastback" page caching in browsers that support
		//		it. Be careful trying to modify the DOM or access
		//		JavaScript properties during this phase of page unloading:
		//		they may not always be available. Consider
		//		dojo.addOnUnload() if you need to modify the DOM or do
		//		heavy JavaScript work since it fires at the eqivalent of
		//		the page's "onbeforeunload" event.
		// example:
		//	| dojo.addOnWindowUnload(functionPointer)
		//	| dojo.addOnWindowUnload(object, "functionName");
		//	| dojo.addOnWindowUnload(object, function(){ /* ... */});

		if (!dojo.windowUnloaded) {
			connect.connect(win, "unload", (dojo.windowUnloaded= function(){}));
		}
		connect.connect(win, "unload", obj, functionName);
	};

	dojo.addOnUnload = function(/*Object?|Function?*/obj, /*String|Function?*/functionName){
		// summary:
		//		registers a function to be triggered when the page unloads.
		//	description:
		//		The first time that addOnUnload is called Dojo will
		//		register a page listener to trigger your unload handler
		//		with.
		//
		//		In a browser enviroment, the functions will be triggered
		//		during the window.onbeforeunload event. Be careful of doing
		//		too much work in an unload handler. onbeforeunload can be
		//		triggered if a link to download a file is clicked, or if
		//		the link is a javascript: link. In these cases, the
		//		onbeforeunload event fires, but the document is not
		//		actually destroyed. So be careful about doing destructive
		//		operations in a dojo.addOnUnload callback.
		//
		//		Further note that calling dojo.addOnUnload will prevent
		//		browsers from using a "fast back" cache to make page
		//		loading via back button instantaneous.
		// example:
		//	| dojo.addOnUnload(functionPointer)
		//	| dojo.addOnUnload(object, "functionName")
		//	| dojo.addOnUnload(object, function(){ /* ... */});

		connect.connect(win, "beforeunload", obj, functionName);
	};

	return {
		addOnWindowUnload: dojo.addOnWindowUnload,
		addOnUnload: dojo.addOnUnload
	};
});

},
'dojo/selector/_loader':function(){
define(["../has", "require"],
		function(has, require){
// summary:
//		This module handles loading the appropriate selector engine for the given browser
"use strict";
var testDiv = document.createElement("div");
has.add("dom-qsa2.1", !!testDiv.querySelectorAll);
has.add("dom-qsa3", function(){
			// test to see if we have a reasonable native selector engine available
			try{
				testDiv.innerHTML = "<p class='TEST'></p>"; // test kind of from sizzle
				// Safari can't handle uppercase or unicode characters when
				// in quirks mode, IE8 can't handle pseudos like :empty
				return testDiv.querySelectorAll(".TEST:empty").length == 1;
			}catch(e){}
		});
var fullEngine;
var acme = "./acme", lite = "./lite";
return {
	load: function(id, parentRequire, loaded, config){
		var req = require;
		// here we implement the default logic for choosing a selector engine
		id = id == "default" ? has("config-selectorEngine") || "css3" : id;
		id = id == "css2" || id == "lite" ? lite :
				id == "css2.1" ? has("dom-qsa2.1") ? lite : acme :
				id == "css3" ? has("dom-qsa3") ? lite : acme :
				id == "acme" ? acme : (req = parentRequire) && id;
		if(id.charAt(id.length-1) == '?'){
			id = id.substring(0,id.length - 1);
			var optionalLoad = true;
		}
		// the query engine is optional, only load it if a native one is not available or existing one has not been loaded
		if(optionalLoad && (has("dom-compliant-qsa") || fullEngine)){
			return loaded(fullEngine);
		}
		// load the referenced selector engine
		req([id], function(engine){
			if(id != "./lite"){
				fullEngine = engine;
			}
			loaded(engine);
		});
	}
};
});

},
'dojo/_base/declare':function(){
define(["./kernel", "../has", "./lang"], function(dojo, has, lang){
	// module:
	//		dojo/_base/declare
	// summary:
	//		This module defines dojo.declare.

	var mix = lang.mixin, op = Object.prototype, opts = op.toString,
		xtor = new Function, counter = 0, cname = "constructor";

	function err(msg, cls){ throw new Error("declare" + (cls ? " " + cls : "") + ": " + msg); }

	// C3 Method Resolution Order (see http://www.python.org/download/releases/2.3/mro/)
	function c3mro(bases, className){
		var result = [], roots = [{cls: 0, refs: []}], nameMap = {}, clsCount = 1,
			l = bases.length, i = 0, j, lin, base, top, proto, rec, name, refs;

		// build a list of bases naming them if needed
		for(; i < l; ++i){
			base = bases[i];
			if(!base){
				err("mixin #" + i + " is unknown. Did you use dojo.require to pull it in?", className);
			}else if(opts.call(base) != "[object Function]"){
				err("mixin #" + i + " is not a callable constructor.", className);
			}
			lin = base._meta ? base._meta.bases : [base];
			top = 0;
			// add bases to the name map
			for(j = lin.length - 1; j >= 0; --j){
				proto = lin[j].prototype;
				if(!proto.hasOwnProperty("declaredClass")){
					proto.declaredClass = "uniqName_" + (counter++);
				}
				name = proto.declaredClass;
				if(!nameMap.hasOwnProperty(name)){
					nameMap[name] = {count: 0, refs: [], cls: lin[j]};
					++clsCount;
				}
				rec = nameMap[name];
				if(top && top !== rec){
					rec.refs.push(top);
					++top.count;
				}
				top = rec;
			}
			++top.count;
			roots[0].refs.push(top);
		}

		// remove classes without external references recursively
		while(roots.length){
			top = roots.pop();
			result.push(top.cls);
			--clsCount;
			// optimization: follow a single-linked chain
			while(refs = top.refs, refs.length == 1){
				top = refs[0];
				if(!top || --top.count){
					// branch or end of chain => do not end to roots
					top = 0;
					break;
				}
				result.push(top.cls);
				--clsCount;
			}
			if(top){
				// branch
				for(i = 0, l = refs.length; i < l; ++i){
					top = refs[i];
					if(!--top.count){
						roots.push(top);
					}
				}
			}
		}
		if(clsCount){
			err("can't build consistent linearization", className);
		}

		// calculate the superclass offset
		base = bases[0];
		result[0] = base ?
			base._meta && base === result[result.length - base._meta.bases.length] ?
				base._meta.bases.length : 1 : 0;

		return result;
	}

	function inherited(args, a, f){
		var name, chains, bases, caller, meta, base, proto, opf, pos,
			cache = this._inherited = this._inherited || {};

		// crack arguments
		if(typeof args == "string"){
			name = args;
			args = a;
			a = f;
		}
		f = 0;

		caller = args.callee;
		name = name || caller.nom;
		if(!name){
			err("can't deduce a name to call inherited()", this.declaredClass);
		}

		meta = this.constructor._meta;
		bases = meta.bases;

		pos = cache.p;
		if(name != cname){
			// method
			if(cache.c !== caller){
				// cache bust
				pos = 0;
				base = bases[0];
				meta = base._meta;
				if(meta.hidden[name] !== caller){
					// error detection
					chains = meta.chains;
					if(chains && typeof chains[name] == "string"){
						err("calling chained method with inherited: " + name, this.declaredClass);
					}
					// find caller
					do{
						meta = base._meta;
						proto = base.prototype;
						if(meta && (proto[name] === caller && proto.hasOwnProperty(name) || meta.hidden[name] === caller)){
							break;
						}
					}while(base = bases[++pos]); // intentional assignment
					pos = base ? pos : -1;
				}
			}
			// find next
			base = bases[++pos];
			if(base){
				proto = base.prototype;
				if(base._meta && proto.hasOwnProperty(name)){
					f = proto[name];
				}else{
					opf = op[name];
					do{
						proto = base.prototype;
						f = proto[name];
						if(f && (base._meta ? proto.hasOwnProperty(name) : f !== opf)){
							break;
						}
					}while(base = bases[++pos]); // intentional assignment
				}
			}
			f = base && f || op[name];
		}else{
			// constructor
			if(cache.c !== caller){
				// cache bust
				pos = 0;
				meta = bases[0]._meta;
				if(meta && meta.ctor !== caller){
					// error detection
					chains = meta.chains;
					if(!chains || chains.constructor !== "manual"){
						err("calling chained constructor with inherited", this.declaredClass);
					}
					// find caller
					while(base = bases[++pos]){ // intentional assignment
						meta = base._meta;
						if(meta && meta.ctor === caller){
							break;
						}
					}
					pos = base ? pos : -1;
				}
			}
			// find next
			while(base = bases[++pos]){	// intentional assignment
				meta = base._meta;
				f = meta ? meta.ctor : base;
				if(f){
					break;
				}
			}
			f = base && f;
		}

		// cache the found super method
		cache.c = f;
		cache.p = pos;

		// now we have the result
		if(f){
			return a === true ? f : f.apply(this, a || args);
		}
		// intentionally no return if a super method was not found
	}

	function getInherited(name, args){
		if(typeof name == "string"){
			return this.__inherited(name, args, true);
		}
		return this.__inherited(name, true);
	}

	function inherited__debug(args, a1, a2){
		var f = this.getInherited(args, a1);
		if(f){ return f.apply(this, a2 || a1 || args); }
		// intentionally no return if a super method was not found
	}

	var inheritedImpl = dojo.config.isDebug ? inherited__debug : inherited;

	// emulation of "instanceof"
	function isInstanceOf(cls){
		var bases = this.constructor._meta.bases;
		for(var i = 0, l = bases.length; i < l; ++i){
			if(bases[i] === cls){
				return true;
			}
		}
		return this instanceof cls;
	}

	function mixOwn(target, source){
		// add props adding metadata for incoming functions skipping a constructor
		for(var name in source){
			if(name != cname && source.hasOwnProperty(name)){
				target[name] = source[name];
			}
		}
		if(has("bug-for-in-skips-shadowed")){
			for(var extraNames= lang._extraNames, i= extraNames.length; i;){
				name = extraNames[--i];
				if(name != cname && source.hasOwnProperty(name)){
					  target[name] = source[name];
				}
			}
		}
	}

	// implementation of safe mixin function
	function safeMixin(target, source){
		var name, t;
		// add props adding metadata for incoming functions skipping a constructor
		for(name in source){
			t = source[name];
			if((t !== op[name] || !(name in op)) && name != cname){
				if(opts.call(t) == "[object Function]"){
					// non-trivial function method => attach its name
					t.nom = name;
				}
				target[name] = t;
			}
		}
		if(has("bug-for-in-skips-shadowed")){
			for(var extraNames= lang._extraNames, i= extraNames.length; i;){
				name = extraNames[--i];
				t = source[name];
				if((t !== op[name] || !(name in op)) && name != cname){
					if(opts.call(t) == "[object Function]"){
						// non-trivial function method => attach its name
						  t.nom = name;
					}
					target[name] = t;
				}
			}
		}
		return target;
	}

	function extend(source){
		declare.safeMixin(this.prototype, source);
		return this;
	}

	// chained constructor compatible with the legacy dojo.declare()
	function chainedConstructor(bases, ctorSpecial){
		return function(){
			var a = arguments, args = a, a0 = a[0], f, i, m,
				l = bases.length, preArgs;

			if(!(this instanceof a.callee)){
				// not called via new, so force it
				return applyNew(a);
			}

			//this._inherited = {};
			// perform the shaman's rituals of the original dojo.declare()
			// 1) call two types of the preamble
			if(ctorSpecial && (a0 && a0.preamble || this.preamble)){
				// full blown ritual
				preArgs = new Array(bases.length);
				// prepare parameters
				preArgs[0] = a;
				for(i = 0;;){
					// process the preamble of the 1st argument
					a0 = a[0];
					if(a0){
						f = a0.preamble;
						if(f){
							a = f.apply(this, a) || a;
						}
					}
					// process the preamble of this class
					f = bases[i].prototype;
					f = f.hasOwnProperty("preamble") && f.preamble;
					if(f){
						a = f.apply(this, a) || a;
					}
					// one peculiarity of the preamble:
					// it is called if it is not needed,
					// e.g., there is no constructor to call
					// let's watch for the last constructor
					// (see ticket #9795)
					if(++i == l){
						break;
					}
					preArgs[i] = a;
				}
			}
			// 2) call all non-trivial constructors using prepared arguments
			for(i = l - 1; i >= 0; --i){
				f = bases[i];
				m = f._meta;
				f = m ? m.ctor : f;
				if(f){
					f.apply(this, preArgs ? preArgs[i] : a);
				}
			}
			// 3) continue the original ritual: call the postscript
			f = this.postscript;
			if(f){
				f.apply(this, args);
			}
		};
	}


	// chained constructor compatible with the legacy dojo.declare()
	function singleConstructor(ctor, ctorSpecial){
		return function(){
			var a = arguments, t = a, a0 = a[0], f;

			if(!(this instanceof a.callee)){
				// not called via new, so force it
				return applyNew(a);
			}

			//this._inherited = {};
			// perform the shaman's rituals of the original dojo.declare()
			// 1) call two types of the preamble
			if(ctorSpecial){
				// full blown ritual
				if(a0){
					// process the preamble of the 1st argument
					f = a0.preamble;
					if(f){
						t = f.apply(this, t) || t;
					}
				}
				f = this.preamble;
				if(f){
					// process the preamble of this class
					f.apply(this, t);
					// one peculiarity of the preamble:
					// it is called even if it is not needed,
					// e.g., there is no constructor to call
					// let's watch for the last constructor
					// (see ticket #9795)
				}
			}
			// 2) call a constructor
			if(ctor){
				ctor.apply(this, a);
			}
			// 3) continue the original ritual: call the postscript
			f = this.postscript;
			if(f){
				f.apply(this, a);
			}
		};
	}

	// plain vanilla constructor (can use inherited() to call its base constructor)
	function simpleConstructor(bases){
		return function(){
			var a = arguments, i = 0, f, m;

			if(!(this instanceof a.callee)){
				// not called via new, so force it
				return applyNew(a);
			}

			//this._inherited = {};
			// perform the shaman's rituals of the original dojo.declare()
			// 1) do not call the preamble
			// 2) call the top constructor (it can use this.inherited())
			for(; f = bases[i]; ++i){ // intentional assignment
				m = f._meta;
				f = m ? m.ctor : f;
				if(f){
					f.apply(this, a);
					break;
				}
			}
			// 3) call the postscript
			f = this.postscript;
			if(f){
				f.apply(this, a);
			}
		};
	}

	function chain(name, bases, reversed){
		return function(){
			var b, m, f, i = 0, step = 1;
			if(reversed){
				i = bases.length - 1;
				step = -1;
			}
			for(; b = bases[i]; i += step){ // intentional assignment
				m = b._meta;
				f = (m ? m.hidden : b.prototype)[name];
				if(f){
					f.apply(this, arguments);
				}
			}
		};
	}

	// forceNew(ctor)
	// return a new object that inherits from ctor.prototype but
	// without actually running ctor on the object.
	function forceNew(ctor){
		// create object with correct prototype using a do-nothing
		// constructor
		xtor.prototype = ctor.prototype;
		var t = new xtor;
		xtor.prototype = null;	// clean up
		return t;
	}

	// applyNew(args)
	// just like 'new ctor()' except that the constructor and its arguments come
	// from args, which must be an array or an arguments object
	function applyNew(args){
		// create an object with ctor's prototype but without
		// calling ctor on it.
		var ctor = args.callee, t = forceNew(ctor);
		// execute the real constructor on the new object
		ctor.apply(t, args);
		return t;
	}

	function declare(className, superclass, props){
		// crack parameters
		if(typeof className != "string"){
			props = superclass;
			superclass = className;
			className = "";
		}
		props = props || {};

		var proto, i, t, ctor, name, bases, chains, mixins = 1, parents = superclass;

		// build a prototype
		if(opts.call(superclass) == "[object Array]"){
			// C3 MRO
			bases = c3mro(superclass, className);
			t = bases[0];
			mixins = bases.length - t;
			superclass = bases[mixins];
		}else{
			bases = [0];
			if(superclass){
				if(opts.call(superclass) == "[object Function]"){
					t = superclass._meta;
					bases = bases.concat(t ? t.bases : superclass);
				}else{
					err("base class is not a callable constructor.", className);
				}
			}else if(superclass !== null){
				err("unknown base class. Did you use dojo.require to pull it in?", className);
			}
		}
		if(superclass){
			for(i = mixins - 1;; --i){
				proto = forceNew(superclass);
				if(!i){
					// stop if nothing to add (the last base)
					break;
				}
				// mix in properties
				t = bases[i];
				(t._meta ? mixOwn : mix)(proto, t.prototype);
				// chain in new constructor
				ctor = new Function;
				ctor.superclass = superclass;
				ctor.prototype = proto;
				superclass = proto.constructor = ctor;
			}
		}else{
			proto = {};
		}
		// add all properties
		declare.safeMixin(proto, props);
		// add constructor
		t = props.constructor;
		if(t !== op.constructor){
			t.nom = cname;
			proto.constructor = t;
		}

		// collect chains and flags
		for(i = mixins - 1; i; --i){ // intentional assignment
			t = bases[i]._meta;
			if(t && t.chains){
				chains = mix(chains || {}, t.chains);
			}
		}
		if(proto["-chains-"]){
			chains = mix(chains || {}, proto["-chains-"]);
		}

		// build ctor
		t = !chains || !chains.hasOwnProperty(cname);
		bases[0] = ctor = (chains && chains.constructor === "manual") ? simpleConstructor(bases) :
			(bases.length == 1 ? singleConstructor(props.constructor, t) : chainedConstructor(bases, t));

		// add meta information to the constructor
		ctor._meta  = {bases: bases, hidden: props, chains: chains,
			parents: parents, ctor: props.constructor};
		ctor.superclass = superclass && superclass.prototype;
		ctor.extend = extend;
		ctor.prototype = proto;
		proto.constructor = ctor;

		// add "standard" methods to the prototype
		proto.getInherited = getInherited;
		proto.isInstanceOf = isInstanceOf;
		proto.inherited    = inheritedImpl;
		proto.__inherited  = inherited;

		// add name if specified
		if(className){
			proto.declaredClass = className;
			lang.setObject(className, ctor);
		}

		// build chains and add them to the prototype
		if(chains){
			for(name in chains){
				if(proto[name] && typeof chains[name] == "string" && name != cname){
					t = proto[name] = chain(name, bases, chains[name] === "after");
					t.nom = name;
				}
			}
		}
		// chained methods do not return values
		// no need to chain "invisible" functions

		return ctor;	// Function
	}

	/*=====
	dojo.declare = function(className, superclass, props){
		//	summary:
		//		Create a feature-rich constructor from compact notation.
		//	className: String?:
		//		The optional name of the constructor (loosely, a "class")
		//		stored in the "declaredClass" property in the created prototype.
		//		It will be used as a global name for a created constructor.
		//	superclass: Function|Function[]:
		//		May be null, a Function, or an Array of Functions. This argument
		//		specifies a list of bases (the left-most one is the most deepest
		//		base).
		//	props: Object:
		//		An object whose properties are copied to the created prototype.
		//		Add an instance-initialization function by making it a property
		//		named "constructor".
		//	returns:
		//		New constructor function.
		//	description:
		//		Create a constructor using a compact notation for inheritance and
		//		prototype extension.
		//
		//		Mixin ancestors provide a type of multiple inheritance.
		//		Prototypes of mixin ancestors are copied to the new class:
		//		changes to mixin prototypes will not affect classes to which
		//		they have been mixed in.
		//
		//		Ancestors can be compound classes created by this version of
		//		dojo.declare. In complex cases all base classes are going to be
		//		linearized according to C3 MRO algorithm
		//		(see http://www.python.org/download/releases/2.3/mro/ for more
		//		details).
		//
		//		"className" is cached in "declaredClass" property of the new class,
		//		if it was supplied. The immediate super class will be cached in
		//		"superclass" property of the new class.
		//
		//		Methods in "props" will be copied and modified: "nom" property
		//		(the declared name of the method) will be added to all copied
		//		functions to help identify them for the internal machinery. Be
		//		very careful, while reusing methods: if you use the same
		//		function under different names, it can produce errors in some
		//		cases.
		//
		//		It is possible to use constructors created "manually" (without
		//		dojo.declare) as bases. They will be called as usual during the
		//		creation of an instance, their methods will be chained, and even
		//		called by "this.inherited()".
		//
		//		Special property "-chains-" governs how to chain methods. It is
		//		a dictionary, which uses method names as keys, and hint strings
		//		as values. If a hint string is "after", this method will be
		//		called after methods of its base classes. If a hint string is
		//		"before", this method will be called before methods of its base
		//		classes.
		//
		//		If "constructor" is not mentioned in "-chains-" property, it will
		//		be chained using the legacy mode: using "after" chaining,
		//		calling preamble() method before each constructor, if available,
		//		and calling postscript() after all constructors were executed.
		//		If the hint is "after", it is chained as a regular method, but
		//		postscript() will be called after the chain of constructors.
		//		"constructor" cannot be chained "before", but it allows
		//		a special hint string: "manual", which means that constructors
		//		are not going to be chained in any way, and programmer will call
		//		them manually using this.inherited(). In the latter case
		//		postscript() will be called after the construction.
		//
		//		All chaining hints are "inherited" from base classes and
		//		potentially can be overridden. Be very careful when overriding
		//		hints! Make sure that all chained methods can work in a proposed
		//		manner of chaining.
		//
		//		Once a method was chained, it is impossible to unchain it. The
		//		only exception is "constructor". You don't need to define a
		//		method in order to supply a chaining hint.
		//
		//		If a method is chained, it cannot use this.inherited() because
		//		all other methods in the hierarchy will be called automatically.
		//
		//		Usually constructors and initializers of any kind are chained
		//		using "after" and destructors of any kind are chained as
		//		"before". Note that chaining assumes that chained methods do not
		//		return any value: any returned value will be discarded.
		//
		//	example:
		//	|	dojo.declare("my.classes.bar", my.classes.foo, {
		//	|		// properties to be added to the class prototype
		//	|		someValue: 2,
		//	|		// initialization function
		//	|		constructor: function(){
		//	|			this.myComplicatedObject = new ReallyComplicatedObject();
		//	|		},
		//	|		// other functions
		//	|		someMethod: function(){
		//	|			doStuff();
		//	|		}
		//	|	});
		//
		//	example:
		//	|	var MyBase = dojo.declare(null, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var MyClass1 = dojo.declare(MyBase, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var MyClass2 = dojo.declare(MyBase, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var MyDiamond = dojo.declare([MyClass1, MyClass2], {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//
		//	example:
		//	|	var F = function(){ console.log("raw constructor"); };
		//	|	F.prototype.method = function(){
		//	|		console.log("raw method");
		//	|	};
		//	|	var A = dojo.declare(F, {
		//	|		constructor: function(){
		//	|			console.log("A.constructor");
		//	|		},
		//	|		method: function(){
		//	|			console.log("before calling F.method...");
		//	|			this.inherited(arguments);
		//	|			console.log("...back in A");
		//	|		}
		//	|	});
		//	|	new A().method();
		//	|	// will print:
		//	|	// raw constructor
		//	|	// A.constructor
		//	|	// before calling F.method...
		//	|	// raw method
		//	|	// ...back in A
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		"-chains-": {
		//	|			destroy: "before"
		//	|		}
		//	|	});
		//	|	var B = dojo.declare(A, {
		//	|		constructor: function(){
		//	|			console.log("B.constructor");
		//	|		},
		//	|		destroy: function(){
		//	|			console.log("B.destroy");
		//	|		}
		//	|	});
		//	|	var C = dojo.declare(B, {
		//	|		constructor: function(){
		//	|			console.log("C.constructor");
		//	|		},
		//	|		destroy: function(){
		//	|			console.log("C.destroy");
		//	|		}
		//	|	});
		//	|	new C().destroy();
		//	|	// prints:
		//	|	// B.constructor
		//	|	// C.constructor
		//	|	// C.destroy
		//	|	// B.destroy
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		"-chains-": {
		//	|			constructor: "manual"
		//	|		}
		//	|	});
		//	|	var B = dojo.declare(A, {
		//	|		constructor: function(){
		//	|			// ...
		//	|			// call the base constructor with new parameters
		//	|			this.inherited(arguments, [1, 2, 3]);
		//	|			// ...
		//	|		}
		//	|	});
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		"-chains-": {
		//	|			m1: "before"
		//	|		},
		//	|		m1: function(){
		//	|			console.log("A.m1");
		//	|		},
		//	|		m2: function(){
		//	|			console.log("A.m2");
		//	|		}
		//	|	});
		//	|	var B = dojo.declare(A, {
		//	|		"-chains-": {
		//	|			m2: "after"
		//	|		},
		//	|		m1: function(){
		//	|			console.log("B.m1");
		//	|		},
		//	|		m2: function(){
		//	|			console.log("B.m2");
		//	|		}
		//	|	});
		//	|	var x = new B();
		//	|	x.m1();
		//	|	// prints:
		//	|	// B.m1
		//	|	// A.m1
		//	|	x.m2();
		//	|	// prints:
		//	|	// A.m2
		//	|	// B.m2
		return new Function(); // Function
	};
	=====*/

	/*=====
	dojo.safeMixin = function(target, source){
		//	summary:
		//		Mix in properties skipping a constructor and decorating functions
		//		like it is done by dojo.declare.
		//	target: Object
		//		Target object to accept new properties.
		//	source: Object
		//		Source object for new properties.
		//	description:
		//		This function is used to mix in properties like lang.mixin does,
		//		but it skips a constructor property and decorates functions like
		//		dojo.declare does.
		//
		//		It is meant to be used with classes and objects produced with
		//		dojo.declare. Functions mixed in with dojo.safeMixin can use
		//		this.inherited() like normal methods.
		//
		//		This function is used to implement extend() method of a constructor
		//		produced with dojo.declare().
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		m1: function(){
		//	|			console.log("A.m1");
		//	|		},
		//	|		m2: function(){
		//	|			console.log("A.m2");
		//	|		}
		//	|	});
		//	|	var B = dojo.declare(A, {
		//	|		m1: function(){
		//	|			this.inherited(arguments);
		//	|			console.log("B.m1");
		//	|		}
		//	|	});
		//	|	B.extend({
		//	|		m2: function(){
		//	|			this.inherited(arguments);
		//	|			console.log("B.m2");
		//	|		}
		//	|	});
		//	|	var x = new B();
		//	|	dojo.safeMixin(x, {
		//	|		m1: function(){
		//	|			this.inherited(arguments);
		//	|			console.log("X.m1");
		//	|		},
		//	|		m2: function(){
		//	|			this.inherited(arguments);
		//	|			console.log("X.m2");
		//	|		}
		//	|	});
		//	|	x.m2();
		//	|	// prints:
		//	|	// A.m1
		//	|	// B.m1
		//	|	// X.m1
	};
	=====*/

	/*=====
	Object.inherited = function(name, args, newArgs){
		//	summary:
		//		Calls a super method.
		//	name: String?
		//		The optional method name. Should be the same as the caller's
		//		name. Usually "name" is specified in complex dynamic cases, when
		//		the calling method was dynamically added, undecorated by
		//		dojo.declare, and it cannot be determined.
		//	args: Arguments
		//		The caller supply this argument, which should be the original
		//		"arguments".
		//	newArgs: Object?
		//		If "true", the found function will be returned without
		//		executing it.
		//		If Array, it will be used to call a super method. Otherwise
		//		"args" will be used.
		//	returns:
		//		Whatever is returned by a super method, or a super method itself,
		//		if "true" was specified as newArgs.
		//	description:
		//		This method is used inside method of classes produced with
		//		dojo.declare to call a super method (next in the chain). It is
		//		used for manually controlled chaining. Consider using the regular
		//		chaining, because it is faster. Use "this.inherited()" only in
		//		complex cases.
		//
		//		This method cannot me called from automatically chained
		//		constructors including the case of a special (legacy)
		//		constructor chaining. It cannot be called from chained methods.
		//
		//		If "this.inherited()" cannot find the next-in-chain method, it
		//		does nothing and returns "undefined". The last method in chain
		//		can be a default method implemented in Object, which will be
		//		called last.
		//
		//		If "name" is specified, it is assumed that the method that
		//		received "args" is the parent method for this call. It is looked
		//		up in the chain list and if it is found the next-in-chain method
		//		is called. If it is not found, the first-in-chain method is
		//		called.
		//
		//		If "name" is not specified, it will be derived from the calling
		//		method (using a methoid property "nom").
		//
		//	example:
		//	|	var B = dojo.declare(A, {
		//	|		method1: function(a, b, c){
		//	|			this.inherited(arguments);
		//	|		},
		//	|		method2: function(a, b){
		//	|			return this.inherited(arguments, [a + b]);
		//	|		}
		//	|	});
		//	|	// next method is not in the chain list because it is added
		//	|	// manually after the class was created.
		//	|	B.prototype.method3 = function(){
		//	|		console.log("This is a dynamically-added method.");
		//	|		this.inherited("method3", arguments);
		//	|	};
		//	example:
		//	|	var B = dojo.declare(A, {
		//	|		method: function(a, b){
		//	|			var super = this.inherited(arguments, true);
		//	|			// ...
		//	|			if(!super){
		//	|				console.log("there is no super method");
		//	|				return 0;
		//	|			}
		//	|			return super.apply(this, arguments);
		//	|		}
		//	|	});
		return	{};	// Object
	}
	=====*/

	/*=====
	Object.getInherited = function(name, args){
		//	summary:
		//		Returns a super method.
		//	name: String?
		//		The optional method name. Should be the same as the caller's
		//		name. Usually "name" is specified in complex dynamic cases, when
		//		the calling method was dynamically added, undecorated by
		//		dojo.declare, and it cannot be determined.
		//	args: Arguments
		//		The caller supply this argument, which should be the original
		//		"arguments".
		//	returns:
		//		Returns a super method (Function) or "undefined".
		//	description:
		//		This method is a convenience method for "this.inherited()".
		//		It uses the same algorithm but instead of executing a super
		//		method, it returns it, or "undefined" if not found.
		//
		//	example:
		//	|	var B = dojo.declare(A, {
		//	|		method: function(a, b){
		//	|			var super = this.getInherited(arguments);
		//	|			// ...
		//	|			if(!super){
		//	|				console.log("there is no super method");
		//	|				return 0;
		//	|			}
		//	|			return super.apply(this, arguments);
		//	|		}
		//	|	});
		return	{};	// Object
	}
	=====*/

	/*=====
	Object.isInstanceOf = function(cls){
		//	summary:
		//		Checks the inheritance chain to see if it is inherited from this
		//		class.
		//	cls: Function
		//		Class constructor.
		//	returns:
		//		"true", if this object is inherited from this class, "false"
		//		otherwise.
		//	description:
		//		This method is used with instances of classes produced with
		//		dojo.declare to determine of they support a certain interface or
		//		not. It models "instanceof" operator.
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var B = dojo.declare(null, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var C = dojo.declare([A, B], {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|	var D = dojo.declare(A, {
		//	|		// constructor, properties, and methods go here
		//	|		// ...
		//	|	});
		//	|
		//	|	var a = new A(), b = new B(), c = new C(), d = new D();
		//	|
		//	|	console.log(a.isInstanceOf(A)); // true
		//	|	console.log(b.isInstanceOf(A)); // false
		//	|	console.log(c.isInstanceOf(A)); // true
		//	|	console.log(d.isInstanceOf(A)); // true
		//	|
		//	|	console.log(a.isInstanceOf(B)); // false
		//	|	console.log(b.isInstanceOf(B)); // true
		//	|	console.log(c.isInstanceOf(B)); // true
		//	|	console.log(d.isInstanceOf(B)); // false
		//	|
		//	|	console.log(a.isInstanceOf(C)); // false
		//	|	console.log(b.isInstanceOf(C)); // false
		//	|	console.log(c.isInstanceOf(C)); // true
		//	|	console.log(d.isInstanceOf(C)); // false
		//	|
		//	|	console.log(a.isInstanceOf(D)); // false
		//	|	console.log(b.isInstanceOf(D)); // false
		//	|	console.log(c.isInstanceOf(D)); // false
		//	|	console.log(d.isInstanceOf(D)); // true
		return	{};	// Object
	}
	=====*/

	/*=====
	Object.extend = function(source){
		//	summary:
		//		Adds all properties and methods of source to constructor's
		//		prototype, making them available to all instances created with
		//		constructor. This method is specific to constructors created with
		//		dojo.declare.
		//	source: Object
		//		Source object which properties are going to be copied to the
		//		constructor's prototype.
		//	description:
		//		Adds source properties to the constructor's prototype. It can
		//		override existing properties.
		//
		//		This method is similar to dojo.extend function, but it is specific
		//		to constructors produced by dojo.declare. It is implemented
		//		using dojo.safeMixin, and it skips a constructor property,
		//		and properly decorates copied functions.
		//
		//	example:
		//	|	var A = dojo.declare(null, {
		//	|		m1: function(){},
		//	|		s1: "Popokatepetl"
		//	|	});
		//	|	A.extend({
		//	|		m1: function(){},
		//	|		m2: function(){},
		//	|		f1: true,
		//	|		d1: 42
		//	|	});
	};
	=====*/

	dojo.safeMixin = declare.safeMixin = safeMixin;
	dojo.declare = declare;

	return declare;
});

},
'dojo/json':function(){
define(["./has"], function(has){
	"use strict";
	var hasJSON = typeof JSON != "undefined";
	has.add("json-parse", hasJSON); // all the parsers work fine
		// Firefox 3.5/Gecko 1.9 fails to use replacer in stringify properly https://bugzilla.mozilla.org/show_bug.cgi?id=509184
	has.add("json-stringify", hasJSON && JSON.stringify({a:0}, function(k,v){return v||1;}) == '{"a":1}'); 
	if(has("json-stringify")){
		return JSON;
	}
	else{
		var escapeString = function(/*String*/str){
			//summary:
			//		Adds escape sequences for non-visual characters, double quote and
			//		backslash and surrounds with double quotes to form a valid string
			//		literal.
			return ('"' + str.replace(/(["\\])/g, '\\$1') + '"').
				replace(/[\f]/g, "\\f").replace(/[\b]/g, "\\b").replace(/[\n]/g, "\\n").
				replace(/[\t]/g, "\\t").replace(/[\r]/g, "\\r"); // string
		};
		return {
			parse: has("json-parse") ? JSON.parse : function(str, strict){
				// summary:
				// 		Parses a [JSON](http://json.org) string to return a JavaScript object.
				// description:
				//		This function follows [native JSON API](https://developer.mozilla.org/en/JSON)
				// 		Throws for invalid JSON strings. This delegates to eval() if native JSON
				// 		support is not available. By default this will evaluate any valid JS expression.
				//		With the strict parameter set to true, the parser will ensure that only
				//		valid JSON strings are parsed (otherwise throwing an error). Without the strict
				// 		parameter, the content passed to this method must come
				//		from a trusted source.
				// str:
				//		a string literal of a JSON item, for instance:
				//			`'{ "foo": [ "bar", 1, { "baz": "thud" } ] }'`
				//	strict: 
				//		When set to true, this will ensure that only valid, secure JSON is ever parsed.
				// 		Make sure this is set to true for untrusted content. Note that on browsers/engines
				//		without native JSON support, setting this to true will run slower.
				if(strict && !/^([\s\[\{]*(?:"(?:\\.|[^"])+"|-?\d[\d\.]*(?:[Ee][+-]?\d+)?|null|true|false|)[\s\]\}]*(?:,|:|$))+$/.test(str)){
					throw new SyntaxError("Invalid characters in JSON");
				}
				return eval('(' + str + ')');
			},
			stringify: function(value, replacer, spacer){
				//	summary:
				//		Returns a [JSON](http://json.org) serialization of an object.
				//	description:
				//		Returns a [JSON](http://json.org) serialization of an object.
				//		This function follows [native JSON API](https://developer.mozilla.org/en/JSON)
				//		Note that this doesn't check for infinite recursion, so don't do that!
				//	value:
				//		A value to be serialized. 
				//	replacer:
				//		A replacer function that is called for each value and can return a replacement
				//	spacer:
				//		A spacer string to be used for pretty printing of JSON
				//		
				//	example:
				//		simple serialization of a trivial object
				//		|	define(["dojo/json"], function(JSON){
				// 		|		var jsonStr = JSON.stringify({ howdy: "stranger!", isStrange: true });
				//		|		doh.is('{"howdy":"stranger!","isStrange":true}', jsonStr);
				var undef;
				if(typeof replacer == "string"){
					spacer = replacer;
					replacer = null;
				}
				function stringify(it, indent, key){
					if(replacer){
						it = replacer(key, it);
					}
					var val, objtype = typeof it;
					if(objtype == "number"){
						return isFinite(it) ? it + "" : "null";
					}
					if(objtype == "boolean"){
						return it + "";
					}
					if(it === null){
						return "null";
					}
					if(typeof it == "string"){
						return escapeString(it);
					}
					if(objtype == "function" || objtype == "undefined"){
						return undef; // undefined
					}
					// short-circuit for objects that support "json" serialization
					// if they return "self" then just pass-through...
					if(typeof it.toJSON == "function"){
						return stringify(it.toJSON(key), indent, key);
					}
					if(it instanceof Date){
						return '"{FullYear}-{Month+}-{Date}T{Hours}:{Minutes}:{Seconds}Z"'.replace(/\{(\w+)(\+)?\}/g, function(t, prop, plus){
							var num = it["getUTC" + prop]() + (plus ? 1 : 0);
							return num < 10 ? "0" + num : num;
						});
					}
					if(it.valueOf() !== it){
						// primitive wrapper, try again unwrapped:
						return stringify(it.valueOf(), indent, key);
					}
					var nextIndent= spacer ? (indent + spacer) : "";
					/* we used to test for DOM nodes and throw, but FF serializes them as {}, so cross-browser consistency is probably not efficiently attainable */ 
				
					var sep = spacer ? " " : "";
					var newLine = spacer ? "\n" : "";
				
					// array
					if(it instanceof Array){
						var itl = it.length, res = [];
						for(key = 0; key < itl; key++){
							var obj = it[key];
							val = stringify(obj, nextIndent, key);
							if(typeof val != "string"){
								val = "null";
							}
							res.push(newLine + nextIndent + val);
						}
						return "[" + res.join(",") + newLine + indent + "]";
					}
					// generic object code path
					var output = [];
					for(key in it){
						var keyStr;
						if(typeof key == "number"){
							keyStr = '"' + key + '"';
						}else if(typeof key == "string"){
							keyStr = escapeString(key);
						}else{
							// skip non-string or number keys
							continue;
						}
						val = stringify(it[key], nextIndent, key);
						if(typeof val != "string"){
							// skip non-serializable values
							continue;
						}
						// At this point, the most non-IE browsers don't get in this branch 
						// (they have native JSON), so push is definitely the way to
						output.push(newLine + nextIndent + keyStr + ":" + sep + val);
					}
					return "{" + output.join(",") + newLine + indent + "}"; // String
				}
				return stringify(value, "", "");
			}
		};
	}
});

},
'dojo/_base/json':function(){
define(["./kernel", "../json"], function(dojo, json){
  // module:
  //    dojo/_base/json
  // summary:
  //    This module defines the dojo JSON API.

dojo.fromJson = function(/*String*/ js){
	// summary:
	//		Parses a JavaScript expression and returns a JavaScript value.
	// description:
	//		Throws for invalid JavaScript expressions. It does not use a strict JSON parser. It
	//		always delegates to eval(). The content passed to this method must therefore come
	//		from a trusted source.
	//		It is recommend that you use dojo/json's parse function for an
	//		implementation uses the (faster) native JSON parse when available.
	// js:
	//		a string literal of a JavaScript expression, for instance:
	//			`'{ "foo": [ "bar", 1, { "baz": "thud" } ] }'`

	return eval("(" + js + ")"); // Object
};

/*=====
dojo._escapeString = function(){
	// summary:
	//		Adds escape sequences for non-visual characters, double quote and
	//		backslash and surrounds with double quotes to form a valid string
	//		literal.
};
=====*/
dojo._escapeString = json.stringify; // just delegate to json.stringify

dojo.toJsonIndentStr = "\t";
dojo.toJson = function(/*Object*/ it, /*Boolean?*/ prettyPrint){
	// summary:
	//		Returns a [JSON](http://json.org) serialization of an object.
	// description:
	//		Returns a [JSON](http://json.org) serialization of an object.
	//		Note that this doesn't check for infinite recursion, so don't do that!
	//		It is recommend that you use dojo/json's stringify function for an lighter
	//		and faster implementation that matches the native JSON API and uses the
	//		native JSON serializer when available.
	// it:
	//		an object to be serialized. Objects may define their own
	//		serialization via a special "__json__" or "json" function
	//		property. If a specialized serializer has been defined, it will
	//		be used as a fallback.
	//		Note that in 1.6, toJson would serialize undefined, but this no longer supported
	//		since it is not supported by native JSON serializer.
	// prettyPrint:
	//		if true, we indent objects and arrays to make the output prettier.
	//		The variable `dojo.toJsonIndentStr` is used as the indent string --
	//		to use something other than the default (tab), change that variable
	//		before calling dojo.toJson().
	//		Note that if native JSON support is available, it will be used for serialization,
	//		and native implementations vary on the exact spacing used in pretty printing.
	// returns:
	// 		A JSON string serialization of the passed-in object.
	// example:
	//		simple serialization of a trivial object
	//		|	var jsonStr = dojo.toJson({ howdy: "stranger!", isStrange: true });
	//		|	doh.is('{"howdy":"stranger!","isStrange":true}', jsonStr);
	// example:
	//		a custom serializer for an objects of a particular class:
	//		|	dojo.declare("Furby", null, {
	//		|		furbies: "are strange",
	//		|		furbyCount: 10,
	//		|		__json__: function(){
	//		|		},
	//		|	});

	// use dojo/json
	return json.stringify(it, function(key, value){
		if(value){
			var tf = value.__json__||value.json;
			if(typeof tf == "function"){
				return tf.call(value);
			}
		}
		return value;
	}, prettyPrint && dojo.toJsonIndentStr);	// String
};

return dojo;
});

},
'dojox/gfx/fx':function(){
define("dojox/gfx/fx", ["dojo/_base/lang", "./_base", "./matrix", "dojo/_base/Color", "dojo/_base/array", "dojo/_base/fx", "dojo/_base/connect"], 
  function(lang, g, m, Color, arr, fx, Hub){
	var fxg = g.fx = {};
	/*===== g = dojox.gfx; fxg = dojox.gfx.fx; =====*/

	// Generic interpolators. Should they be moved to dojox.fx?

	function InterpolNumber(start, end){
		this.start = start, this.end = end;
	}
	InterpolNumber.prototype.getValue = function(r){
		return (this.end - this.start) * r + this.start;
	};

	function InterpolUnit(start, end, units){
		this.start = start, this.end = end;
		this.units = units;
	}
	InterpolUnit.prototype.getValue = function(r){
		return (this.end - this.start) * r + this.start + this.units;
	};

	function InterpolColor(start, end){
		this.start = start, this.end = end;
		this.temp = new Color();
	}
	InterpolColor.prototype.getValue = function(r){
		return Color.blendColors(this.start, this.end, r, this.temp);
	};

	function InterpolValues(values){
		this.values = values;
		this.length = values.length;
	}
	InterpolValues.prototype.getValue = function(r){
		return this.values[Math.min(Math.floor(r * this.length), this.length - 1)];
	};

	function InterpolObject(values, def){
		this.values = values;
		this.def = def ? def : {};
	}
	InterpolObject.prototype.getValue = function(r){
		var ret = lang.clone(this.def);
		for(var i in this.values){
			ret[i] = this.values[i].getValue(r);
		}
		return ret;
	};

	function InterpolTransform(stack, original){
		this.stack = stack;
		this.original = original;
	}
	InterpolTransform.prototype.getValue = function(r){
		var ret = [];
		arr.forEach(this.stack, function(t){
			if(t instanceof m.Matrix2D){
				ret.push(t);
				return;
			}
			if(t.name == "original" && this.original){
				ret.push(this.original);
				return;
			}
			if(!(t.name in m)){ return; }
			var f = m[t.name];
			if(typeof f != "function"){
				// constant
				ret.push(f);
				return;
			}
			var val = arr.map(t.start, function(v, i){
							return (t.end[i] - v) * r + v;
						}),
				matrix = f.apply(m, val);
			if(matrix instanceof m.Matrix2D){
				ret.push(matrix);
			}
		}, this);
		return ret;
	};

	var transparent = new Color(0, 0, 0, 0);

	function getColorInterpol(prop, obj, name, def){
		if(prop.values){
			return new InterpolValues(prop.values);
		}
		var value, start, end;
		if(prop.start){
			start = g.normalizeColor(prop.start);
		}else{
			start = value = obj ? (name ? obj[name] : obj) : def;
		}
		if(prop.end){
			end = g.normalizeColor(prop.end);
		}else{
			if(!value){
				value = obj ? (name ? obj[name] : obj) : def;
			}
			end = value;
		}
		return new InterpolColor(start, end);
	}

	function getNumberInterpol(prop, obj, name, def){
		if(prop.values){
			return new InterpolValues(prop.values);
		}
		var value, start, end;
		if(prop.start){
			start = prop.start;
		}else{
			start = value = obj ? obj[name] : def;
		}
		if(prop.end){
			end = prop.end;
		}else{
			if(typeof value != "number"){
				value = obj ? obj[name] : def;
			}
			end = value;
		}
		return new InterpolNumber(start, end);
	}

	fxg.animateStroke = function(/*Object*/ args){
		// summary:
		//	Returns an animation which will change stroke properties over time.
		// example:
		//	|	dojox.gfx.fx.animateStroke{{
		//	|		shape: shape,
		//	|		duration: 500,
		//	|		color: {start: "red", end: "green"},
		//	|		width: {end: 15},
		//	|		join:  {values: ["miter", "bevel", "round"]}
		//	|	}).play();
		if(!args.easing){ args.easing = fx._defaultEasing; }
		var anim = new fx.Animation(args), shape = args.shape, stroke;
		Hub.connect(anim, "beforeBegin", anim, function(){
			stroke = shape.getStroke();
			var prop = args.color, values = {}, value, start, end;
			if(prop){
				values.color = getColorInterpol(prop, stroke, "color", transparent);
			}
			prop = args.style;
			if(prop && prop.values){
				values.style = new InterpolValues(prop.values);
			}
			prop = args.width;
			if(prop){
				values.width = getNumberInterpol(prop, stroke, "width", 1);
			}
			prop = args.cap;
			if(prop && prop.values){
				values.cap = new InterpolValues(prop.values);
			}
			prop = args.join;
			if(prop){
				if(prop.values){
					values.join = new InterpolValues(prop.values);
				}else{
					start = prop.start ? prop.start : (stroke && stroke.join || 0);
					end = prop.end ? prop.end : (stroke && stroke.join || 0);
					if(typeof start == "number" && typeof end == "number"){
						values.join = new InterpolNumber(start, end);
					}
				}
			}
			this.curve = new InterpolObject(values, stroke);
		});
		Hub.connect(anim, "onAnimate", shape, "setStroke");
		return anim; // dojo.Animation
	};

	fxg.animateFill = function(/*Object*/ args){
		// summary:
		//	Returns an animation which will change fill color over time.
		//	Only solid fill color is supported at the moment
		// example:
		//	|	dojox.gfx.fx.animateFill{{
		//	|		shape: shape,
		//	|		duration: 500,
		//	|		color: {start: "red", end: "green"}
		//	|	}).play();
		if(!args.easing){ args.easing = fx._defaultEasing; }
		var anim = new fx.Animation(args), shape = args.shape, fill;
		Hub.connect(anim, "beforeBegin", anim, function(){
			fill = shape.getFill();
			var prop = args.color, values = {};
			if(prop){
				this.curve = getColorInterpol(prop, fill, "", transparent);
			}
		});
		Hub.connect(anim, "onAnimate", shape, "setFill");
		return anim; // dojo.Animation
	};

	fxg.animateFont = function(/*Object*/ args){
		// summary:
		//	Returns an animation which will change font properties over time.
		// example:
		//	|	dojox.gfx.fx.animateFont{{
		//	|		shape: shape,
		//	|		duration: 500,
		//	|		variant: {values: ["normal", "small-caps"]},
		//	|		size:  {end: 10, units: "pt"}
		//	|	}).play();
		if(!args.easing){ args.easing = fx._defaultEasing; }
		var anim = new fx.Animation(args), shape = args.shape, font;
		Hub.connect(anim, "beforeBegin", anim, function(){
			font = shape.getFont();
			var prop = args.style, values = {}, value, start, end;
			if(prop && prop.values){
				values.style = new InterpolValues(prop.values);
			}
			prop = args.variant;
			if(prop && prop.values){
				values.variant = new InterpolValues(prop.values);
			}
			prop = args.weight;
			if(prop && prop.values){
				values.weight = new InterpolValues(prop.values);
			}
			prop = args.family;
			if(prop && prop.values){
				values.family = new InterpolValues(prop.values);
			}
			prop = args.size;
			if(prop && prop.units){
				start = parseFloat(prop.start ? prop.start : (shape.font && shape.font.size || "0"));
				end = parseFloat(prop.end ? prop.end : (shape.font && shape.font.size || "0"));
				values.size = new InterpolUnit(start, end, prop.units);
			}
			this.curve = new InterpolObject(values, font);
		});
		Hub.connect(anim, "onAnimate", shape, "setFont");
		return anim; // dojo.Animation
	};

	fxg.animateTransform = function(/*Object*/ args){
		// summary:
		//	Returns an animation which will change transformation over time.
		// example:
		//	|	dojox.gfx.fx.animateTransform{{
		//	|		shape: shape,
		//	|		duration: 500,
		//	|		transform: [
		//	|			{name: "translate", start: [0, 0], end: [200, 200]},
		//	|			{name: "original"}
		//	|		]
		//	|	}).play();
		if(!args.easing){ args.easing = fx._defaultEasing; }
		var anim = new fx.Animation(args), shape = args.shape, original;
		Hub.connect(anim, "beforeBegin", anim, function(){
			original = shape.getTransform();
			this.curve = new InterpolTransform(args.transform, original);
		});
		Hub.connect(anim, "onAnimate", shape, "setTransform");
		return anim; // dojo.Animation
	};
	
	return fxg;
});

},
'dojo/dom-construct':function(){
define("dojo/dom-construct", ["exports", "./_base/kernel", "./_base/sniff", "./_base/window", "./dom", "./dom-attr", "./on"],
		function(exports, dojo, has, win, dom, attr, on){
	// module:
	//		dojo/dom-construct
	// summary:
	//		This module defines the core dojo DOM construction API.

	/*=====
	dojo.toDom = function(frag, doc){
		// summary:
		//		instantiates an HTML fragment returning the corresponding DOM.
		// frag: String
		//		the HTML fragment
		// doc: DocumentNode?
		//		optional document to use when creating DOM nodes, defaults to
		//		dojo.doc if not specified.
		// returns: DocumentFragment
		//
		// example:
		//		Create a table row:
		//	|	var tr = dojo.toDom("<tr><td>First!</td></tr>");
	};
	=====*/

	/*=====
	dojo._toDom = function(frag, doc){
		// summary:
		//		Existing alias for `dojo.toDom`. Deprecated, will be removed in 2.0.
	};
	=====*/

	/*=====
	dojo.place = function(node, refNode, position){
		// summary:
		//		Attempt to insert node into the DOM, choosing from various positioning options.
		//		Returns the first argument resolved to a DOM node.
		//
		// node: DOMNode|String
		//		id or node reference, or HTML fragment starting with "<" to place relative to refNode
		//
		// refNode: DOMNode|String
		//		id or node reference to use as basis for placement
		//
		// position: String|Number?
		//		string noting the position of node relative to refNode or a
		//		number indicating the location in the childNodes collection of refNode.
		//		Accepted string values are:
		//	|	* before
		//	|	* after
		//	|	* replace
		//	|	* only
		//	|	* first
		//	|	* last
		//		"first" and "last" indicate positions as children of refNode, "replace" replaces refNode,
		//		"only" replaces all children.  position defaults to "last" if not specified
		//
		// returns: DOMNode
		//		Returned values is the first argument resolved to a DOM node.
		//
		//		.place() is also a method of `dojo.NodeList`, allowing `dojo.query` node lookups.
		//
		// example:
		//		Place a node by string id as the last child of another node by string id:
		//	|	dojo.place("someNode", "anotherNode");
		//
		// example:
		//		Place a node by string id before another node by string id
		//	|	dojo.place("someNode", "anotherNode", "before");
		//
		// example:
		//		Create a Node, and place it in the body element (last child):
		//	|	dojo.place("<div></div>", dojo.body());
		//
		// example:
		//		Put a new LI as the first child of a list by id:
		//	|	dojo.place("<li></li>", "someUl", "first");
	};
	=====*/

	/*=====
	dojo.create = function(tag, attrs, refNode, pos){
		// summary:
		//		Create an element, allowing for optional attribute decoration
		//		and placement.
		//
		// description:
		//		A DOM Element creation function. A shorthand method for creating a node or
		//		a fragment, and allowing for a convenient optional attribute setting step,
		//		as well as an optional DOM placement reference.
		//|
		//		Attributes are set by passing the optional object through `dojo.setAttr`.
		//		See `dojo.setAttr` for noted caveats and nuances, and API if applicable.
		//|
		//		Placement is done via `dojo.place`, assuming the new node to be the action
		//		node, passing along the optional reference node and position.
		//
		// tag: DOMNode|String
		//		A string of the element to create (eg: "div", "a", "p", "li", "script", "br"),
		//		or an existing DOM node to process.
		//
		// attrs: Object
		//		An object-hash of attributes to set on the newly created node.
		//		Can be null, if you don't want to set any attributes/styles.
		//		See: `dojo.setAttr` for a description of available attributes.
		//
		// refNode: DOMNode?|String?
		//		Optional reference node. Used by `dojo.place` to place the newly created
		//		node somewhere in the dom relative to refNode. Can be a DomNode reference
		//		or String ID of a node.
		//
		// pos: String?
		//		Optional positional reference. Defaults to "last" by way of `dojo.place`,
		//		though can be set to "first","after","before","last", "replace" or "only"
		//		to further control the placement of the new node relative to the refNode.
		//		'refNode' is required if a 'pos' is specified.
		//
		// returns: DOMNode
		//
		// example:
		//		Create a DIV:
		//	|	var n = dojo.create("div");
		//
		// example:
		//		Create a DIV with content:
		//	|	var n = dojo.create("div", { innerHTML:"<p>hi</p>" });
		//
		// example:
		//		Place a new DIV in the BODY, with no attributes set
		//	|	var n = dojo.create("div", null, dojo.body());
		//
		// example:
		//		Create an UL, and populate it with LI's. Place the list as the first-child of a
		//		node with id="someId":
		//	|	var ul = dojo.create("ul", null, "someId", "first");
		//	|	var items = ["one", "two", "three", "four"];
		//	|	dojo.forEach(items, function(data){
		//	|		dojo.create("li", { innerHTML: data }, ul);
		//	|	});
		//
		// example:
		//		Create an anchor, with an href. Place in BODY:
		//	|	dojo.create("a", { href:"foo.html", title:"Goto FOO!" }, dojo.body());
		//
		// example:
		//		Create a `dojo.NodeList()` from a new element (for syntatic sugar):
		//	|	dojo.query(dojo.create('div'))
		//	|		.addClass("newDiv")
		//	|		.onclick(function(e){ console.log('clicked', e.target) })
		//	|		.place("#someNode"); // redundant, but cleaner.
	};
	=====*/

	/*=====
	dojo.empty = function(node){
			// summary:
			//		safely removes all children of the node.
			// node: DOMNode|String
			//		a reference to a DOM node or an id.
			// example:
			//		Destroy node's children byId:
			//	|	dojo.empty("someId");
			//
			// example:
			//		Destroy all nodes' children in a list by reference:
			//	|	dojo.query(".someNode").forEach(dojo.empty);
	}
	=====*/

	/*=====
	dojo.destroy = function(node){
		// summary:
		//		Removes a node from its parent, clobbering it and all of its
		//		children.
		//
		// description:
		//		Removes a node from its parent, clobbering it and all of its
		//		children. Function only works with DomNodes, and returns nothing.
		//
		// node: DOMNode|String
		//		A String ID or DomNode reference of the element to be destroyed
		//
		// example:
		//		Destroy a node byId:
		//	|	dojo.destroy("someId");
		//
		// example:
		//		Destroy all nodes in a list by reference:
		//	|	dojo.query(".someNode").forEach(dojo.destroy);
	};
	=====*/

	/*=====
	dojo._destroyElement = function(node){
		// summary:
		//		Existing alias for `dojo.destroy`. Deprecated, will be removed in 2.0.
	};
	=====*/

	// support stuff for dojo.toDom
	var tagWrap = {
			option: ["select"],
			tbody: ["table"],
			thead: ["table"],
			tfoot: ["table"],
			tr: ["table", "tbody"],
			td: ["table", "tbody", "tr"],
			th: ["table", "thead", "tr"],
			legend: ["fieldset"],
			caption: ["table"],
			colgroup: ["table"],
			col: ["table", "colgroup"],
			li: ["ul"]
		},
		reTag = /<\s*([\w\:]+)/,
		masterNode = {}, masterNum = 0,
		masterName = "__" + dojo._scopeName + "ToDomId";

	// generate start/end tag strings to use
	// for the injection for each special tag wrap case.
	for(var param in tagWrap){
		if(tagWrap.hasOwnProperty(param)){
			var tw = tagWrap[param];
			tw.pre = param == "option" ? '<select multiple="multiple">' : "<" + tw.join("><") + ">";
			tw.post = "</" + tw.reverse().join("></") + ">";
			// the last line is destructive: it reverses the array,
			// but we don't care at this point
		}
	}

	function _insertBefore(/*DomNode*/node, /*DomNode*/ref){
		var parent = ref.parentNode;
		if(parent){
			parent.insertBefore(node, ref);
		}
	}

	function _insertAfter(/*DomNode*/node, /*DomNode*/ref){
		// summary:
		//		Try to insert node after ref
		var parent = ref.parentNode;
		if(parent){
			if(parent.lastChild == ref){
				parent.appendChild(node);
			}else{
				parent.insertBefore(node, ref.nextSibling);
			}
		}
	}

	var _destroyContainer = null,
		_destroyDoc;
		on(window, "unload", function(){
		_destroyContainer = null; //prevent IE leak
	});
	
	exports.toDom = function toDom(frag, doc){
		doc = doc || win.doc;
		var masterId = doc[masterName];
		if(!masterId){
			doc[masterName] = masterId = ++masterNum + "";
			masterNode[masterId] = doc.createElement("div");
		}

		// make sure the frag is a string.
		frag += "";

		// find the starting tag, and get node wrapper
		var match = frag.match(reTag),
			tag = match ? match[1].toLowerCase() : "",
			master = masterNode[masterId],
			wrap, i, fc, df;
		if(match && tagWrap[tag]){
			wrap = tagWrap[tag];
			master.innerHTML = wrap.pre + frag + wrap.post;
			for(i = wrap.length; i; --i){
				master = master.firstChild;
			}
		}else{
			master.innerHTML = frag;
		}

		// one node shortcut => return the node itself
		if(master.childNodes.length == 1){
			return master.removeChild(master.firstChild); // DOMNode
		}

		// return multiple nodes as a document fragment
		df = doc.createDocumentFragment();
		while(fc = master.firstChild){ // intentional assignment
			df.appendChild(fc);
		}
		return df; // DOMNode
	};

	exports.place = function place(/*DOMNode|String*/node, /*DOMNode|String*/refNode, /*String|Number?*/position){
		refNode = dom.byId(refNode);
		if(typeof node == "string"){ // inline'd type check
			node = /^\s*</.test(node) ? exports.toDom(node, refNode.ownerDocument) : dom.byId(node);
		}
		if(typeof position == "number"){ // inline'd type check
			var cn = refNode.childNodes;
			if(!cn.length || cn.length <= position){
				refNode.appendChild(node);
			}else{
				_insertBefore(node, cn[position < 0 ? 0 : position]);
			}
		}else{
			switch(position){
				case "before":
					_insertBefore(node, refNode);
					break;
				case "after":
					_insertAfter(node, refNode);
					break;
				case "replace":
					refNode.parentNode.replaceChild(node, refNode);
					break;
				case "only":
					exports.empty(refNode);
					refNode.appendChild(node);
					break;
				case "first":
					if(refNode.firstChild){
						_insertBefore(node, refNode.firstChild);
						break;
					}
					// else fallthrough...
				default: // aka: last
					refNode.appendChild(node);
			}
		}
		return node; // DomNode
	};

	exports.create = function create(/*DOMNode|String*/tag, /*Object*/attrs, /*DOMNode?|String?*/refNode, /*String?*/pos){
		var doc = win.doc;
		if(refNode){
			refNode = dom.byId(refNode);
			doc = refNode.ownerDocument;
		}
		if(typeof tag == "string"){ // inline'd type check
			tag = doc.createElement(tag);
		}
		if(attrs){ attr.set(tag, attrs); }
		if(refNode){ exports.place(tag, refNode, pos); }
		return tag; // DomNode
	};

	exports.empty =
				has("ie") ? function(node){
			node = dom.byId(node);
			for(var c; c = node.lastChild;){ // intentional assignment
				exports.destroy(c);
			}
		} :
				function(node){
			dom.byId(node).innerHTML = "";
		};

	exports.destroy = function destroy(/*DOMNode|String*/node){
		node = dom.byId(node);
		try{
			var doc = node.ownerDocument;
			// cannot use _destroyContainer.ownerDocument since this can throw an exception on IE
			if(!_destroyContainer || _destroyDoc != doc){
				_destroyContainer = doc.createElement("div");
				_destroyDoc = doc;
			}
			_destroyContainer.appendChild(node.parentNode ? node.parentNode.removeChild(node) : node);
			// NOTE: see http://trac.dojotoolkit.org/ticket/2931. This may be a bug and not a feature
			_destroyContainer.innerHTML = "";
		}catch(e){
			/* squelch */
		}
	};
});

},
'dojo/_base/browser':function(){
if(require.has){
	require.has.add("config-selectorEngine", "acme");
}
define("dojo/_base/browser", [
	"../ready",
	"./kernel",
	"./connect", // until we decide if connect is going back into non-browser environments
	"./unload",
	"./window",
	"./event",
	"./html",
	"./NodeList",
	"../query",
	"./xhr",
	"./fx"], function(dojo) {
	// module:
	//		dojo/_base/browser
	// summary:
	//		This module causes the browser-only base modules to be loaded.
	return dojo;
});

},
'dojox/socket':function(){
define("dojox/socket", ["dojo", "dojo/on", "dojo/Evented", "dojo/cookie", "dojo/_base/url"], function(dojo, on, Evented) {

var WebSocket = window.WebSocket;

function Socket(/*dojo.__XhrArgs*/ argsOrUrl){
	// summary:
	//		Provides a simple socket connection using WebSocket, or alternate
	// 		communication mechanisms in legacy browsers for comet-style communication. This is based
	//		on the WebSocket API and returns an object that implements the WebSocket interface:
	//		http://dev.w3.org/html5/websockets/#websocket
	//	description:
	//		Provides socket connections. This can be used with virtually any Comet protocol.
	//	argsOrUrl:
	//		This uses the same arguments as the other I/O functions in Dojo, or a
	// 		URL to connect to. The URL should be a relative URL in order to properly
	//		work with WebSockets (it can still be host relative, like //other-site.org/endpoint)
	// returns:
	// 		An object that implements the WebSocket API
	// example:
	//		| dojo.require("dojox.socket");
	//		| var socket = dojox.socket({"url://comet-server/comet");
	//		| // we could also add auto-reconnect support
	//		| // now we can connect to standard HTML5 WebSocket-style events
	//		| dojo.connect(socket, "onmessage", function(event){
	//		|    var message = event.data;
	//		|    // do something with the message
	//		| });
	//		| // send something
	//		| socket.send("hi there");
	//		| whenDone(function(){
	//		|   socket.close();
	//		| });
	//		You can also use the Reconnect module:
	//		| dojo.require("dojox.socket");
	//		| dojo.require("dojox.socket.Reconnect");
	//		| var socket = dojox.socket({url:"/comet"});
	//		| // add auto-reconnect support
	//		| socket = dojox.socket.Reconnect(socket);
	if(typeof argsOrUrl == "string"){
		argsOrUrl = {url: argsOrUrl};
	}
	return WebSocket ? dojox.socket.WebSocket(argsOrUrl, true) : dojox.socket.LongPoll(argsOrUrl);
};
dojox.socket = Socket;

Socket.WebSocket = function(args, fallback){
	// summary:
	//		A wrapper for WebSocket, than handles standard args and relative URLs
	var ws = new WebSocket(new dojo._Url(document.baseURI.replace(/^http/i,'ws'), args.url));
	ws.on = function(type, listener){
		ws.addEventListener(type, listener, true);
	};
	var opened;
	dojo.connect(ws, "onopen", function(event){
		opened = true;
	});
	dojo.connect(ws, "onclose", function(event){
		if(opened){
			return;
		}
		if(fallback){
			Socket.replace(ws, dojox.socket.LongPoll(args), true);
		}
	});
	return ws;
};
Socket.replace = function(socket, newSocket, listenForOpen){
	// make the original socket a proxy for the new socket
	socket.send = dojo.hitch(newSocket, "send");
	socket.close = dojo.hitch(newSocket, "close");
	if(listenForOpen){
		proxyEvent("open");
	}
	// redirect the events as well
	dojo.forEach(["message", "close", "error"], proxyEvent);
	function proxyEvent(type){
		(newSocket.addEventListener || newSocket.on).call(newSocket, type, function(event){
			on.emit(socket, event.type, event);
		}, true);
	}
};
Socket.LongPoll = function(/*dojo.__XhrArgs*/ args){
	// summary:
	//		Provides a simple long-poll based comet-style socket/connection to a server and returns an
	// 		object implementing the WebSocket interface:
	//		http://dev.w3.org/html5/websockets/#websocket
	//	args:
	//		This uses the same arguments as the other I/O functions in Dojo, with this addition:
	//	args.interval:
	//		Indicates the amount of time (in milliseconds) after a response was received
	//		before another request is made. By default, a request is made immediately
	//		after getting a response. The interval can be increased to reduce load on the
	//		server or to do simple time-based polling where the server always responds
	// 		immediately.
	//	args.transport:
	//		Provide an alternate transport like dojo.io.script.get
	// returns:
	// 		An object that implements the WebSocket API
	// example:
	//		| dojo.require("dojox.socket.LongPoll");
	//		| var socket = dojox.socket.LongPoll({url:"/comet"});
	//		or:
	//		| dojo.require("dojox.socket.LongPoll");
	//		| dojox.socket.LongPoll.add();
	//		| var socket = dojox.socket({url:"/comet"});

var cancelled = false,
		first = true,
		timeoutId,
		connections = [];

	// create the socket object
	var socket = {
		send: function(data){
			// summary:
			// 		Send some data using XHR or provided transport
			var sendArgs = dojo.delegate(args);
			sendArgs.rawBody = data;
			clearTimeout(timeoutId);
			var deferred = first ? (first = false) || socket.firstRequest(sendArgs) :
				socket.transport(sendArgs);
			connections.push(deferred);
			deferred.then(function(response){
				// got a response
				socket.readyState = 1;
				// remove the current connection
				connections.splice(dojo.indexOf(connections, deferred), 1);
				// reconnect to listen for the next message if there are no active connections,
				// we queue it up in case one of the onmessage handlers has a message to send
				if(!connections.length){
					timeoutId = setTimeout(connect, args.interval);
				}
				if(response){
					// now send the message along to listeners
					fire("message", {data: response}, deferred);
				}
			}, function(error){
				connections.splice(dojo.indexOf(connections, deferred), 1);
				// an error occurred, fire the appropriate event listeners
				if(!cancelled){
					fire("error", {error:error}, deferred);
					if(!connections.length){
						socket.readyState = 3;
						fire("close", {wasClean:false}, deferred);
					}
				}
			});
			return deferred;
		},
		close: function(){
			// summary:
			// 		Close the connection
			socket.readyState = 2;
			cancelled = true;
			for(var i = 0; i < connections.length; i++){
				connections[i].cancel();
			}
			socket.readyState = 3;
			fire("close", {wasClean:true});
		},
		transport: args.transport || dojo.xhrPost,
		args: args,
		url: args.url,
		readyState: 0,
		CONNECTING: 0,
		OPEN: 1,
		CLOSING: 2,
		CLOSED: 3,
		on: Evented.prototype.on,
		firstRequest: function(args){
			// summary:
			// 		This allows for special handling for the first request. This is useful for
			//		providing information to disambiguate between the first request and
			//		subsequent long-poll requests so the server can properly setup a
			// 		connection on the first connection or reject a request for an expired
			// 		connection if the request is not expecting to be the first for a connection.
			//		This method can be overriden. The default behavior is to include a Pragma
			//		header with a value of "start-long-poll"
			var headers = (args.headers || (args.headers = {}));
			headers.Pragma = "start-long-poll";
			try{
				return this.transport(args);
			}finally{
				// cleanup the header so it is not used on subsequent requests
				delete headers.Pragma;
			}
		}
	};
	function connect(){
		if(socket.readyState == 0){
			// we fire the open event now because we really don't know when the "socket"
			// is truly open, and this gives us a to do a send() and get it included in the
			// HTTP request
			fire("open",{});
		}
		// make the long-poll connection, to wait for response from the server
		if(!connections.length){
			socket.send();
		}
	}
	function fire(type, object, deferred){
		if(socket["on" + type]){
			object.ioArgs = deferred && deferred.ioArgs;
			object.type = type;
			on.emit(socket, type, object);
		}
	}
	// provide an alias for Dojo's connect method
	socket.connect = socket.on;
	// do the initial connection
	setTimeout(connect);
	return socket;
};
return Socket;
});
},
'dojo/_base/event':function(){
define(["./kernel", "../on", "../has", "../dom-geometry"], function(dojo, on, has, dom){
  //  module:
  //    dojo/_base/event
  //  summary:
  //    This module defines dojo DOM event API.
	if(on._fixEvent){
		var fixEvent = on._fixEvent;
		on._fixEvent = function(evt, se){
			// add some additional normalization for back-compat, this isn't in on.js because it is somewhat more expensive
			evt = fixEvent(evt, se);
			if(evt){
				dom.normalizeEvent(evt);
			}
			return evt;
		};		
	}
	dojo.fixEvent = function(/*Event*/ evt, /*DOMNode*/ sender){
		// summary:
		//		normalizes properties on the event object including event
		//		bubbling methods, keystroke normalization, and x/y positions
		// evt: Event
		//		native event object
		// sender: DOMNode
		//		node to treat as "currentTarget"
		if(on._fixEvent){
			return on._fixEvent(evt, sender);
		}
		return evt;	// Event
	};
	
	dojo.stopEvent = function(/*Event*/ evt){
		// summary:
		//		prevents propagation and clobbers the default action of the
		//		passed event
		// evt: Event
		//		The event object. If omitted, window.event is used on IE.
		if(has("dom-addeventlistener") || (evt && evt.preventDefault)){
			evt.preventDefault();
			evt.stopPropagation();
		}else{
			evt = evt || window.event;
			evt.cancelBubble = true;
			on._preventDefault.call(evt);
		}
	};

	return {
		fix: dojo.fixEvent,
		stop: dojo.stopEvent
	};
});

},
'dojox/main':function(){
define("dojox/main", ["dojo/_base/kernel"], function(dojo) {
	// module:
	//		dojox/main
	// summary:
	//		The dojox package main module; dojox package is somewhat unusual in that the main module currently just provides an empty object.

	return dojo.dojox;
});
},
'dojo/store/util/QueryResults':function(){
define(["../../_base/array", "../../_base/lang", "../../_base/Deferred"
], function(array, lang, Deferred) {
  //  module:
  //    dojo/store/util/QueryResults
  //  summary:
  //    The module defines a query results wrapper

var util = lang.getObject("dojo.store.util", true);

util.QueryResults = function(results){
	// summary:
	//		A function that wraps the results of a store query with additional
	//		methods.
	//
	// description:
	//		QueryResults is a basic wrapper that allows for array-like iteration
	//		over any kind of returned data from a query.  While the simplest store
	//		will return a plain array of data, other stores may return deferreds or
	//		promises; this wrapper makes sure that *all* results can be treated
	//		the same.
	//
	//		Additional methods include `forEach`, `filter` and `map`.
	//
	// returns: Object
	//		An array-like object that can be used for iterating over.
	//
	// example:
	//		Query a store and iterate over the results.
	//
	//	|	store.query({ prime: true }).forEach(function(item){
	//	|		//	do something
	//	|	});

	if(!results){
		return results;
	}
	// if it is a promise it may be frozen
	if(results.then){
		results = lang.delegate(results);
	}
	function addIterativeMethod(method){
		if(!results[method]){
			results[method] = function(){
				var args = arguments;
				return Deferred.when(results, function(results){
					Array.prototype.unshift.call(args, results);
					return util.QueryResults(array[method].apply(array, args));
				});
			};
		}
	}
	addIterativeMethod("forEach");
	addIterativeMethod("filter");
	addIterativeMethod("map");
	if(!results.total){
		results.total = Deferred.when(results, function(results){
			return results.length;
		});
	}
	return results;
};

return util.QueryResults;
});

},
'dojox/gfx/gradutils':function(){
// Various generic utilities to deal with a linear gradient

define("dojox/gfx/gradutils", ["./_base", "dojo/_base/lang", "./matrix", "dojo/_base/Color"], 
  function(g, lang, m, Color){
  
	/*===== g= dojox.gfx =====*/
	var gradutils = g.gradutils = {};
	/*===== g= dojox.gfx; gradutils = dojox.gfx.gradutils; =====*/

	function findColor(o, c){
		if(o <= 0){
			return c[0].color;
		}
		var len = c.length;
		if(o >= 1){
			return c[len - 1].color;
		}
		//TODO: use binary search
		for(var i = 0; i < len; ++i){
			var stop = c[i];
			if(stop.offset >= o){
				if(i){
					var prev = c[i - 1];
					return Color.blendColors(new Color(prev.color), new Color(stop.color),
						(o - prev.offset) / (stop.offset - prev.offset));
				}
				return stop.color;
			}
		}
		return c[len - 1].color;
	}

	gradutils.getColor = function(fill, pt){
		// summary:
		//		sample a color from a gradient using a point
		// fill: Object:
		//		fill object
		// pt: dojox.gfx.Point:
		//		point where to sample a color
		var o;
		if(fill){
			switch(fill.type){
				case "linear":
					var angle = Math.atan2(fill.y2 - fill.y1, fill.x2 - fill.x1),
						rotation = m.rotate(-angle),
						projection = m.project(fill.x2 - fill.x1, fill.y2 - fill.y1),
						p = m.multiplyPoint(projection, pt),
						pf1 = m.multiplyPoint(projection, fill.x1, fill.y1),
						pf2 = m.multiplyPoint(projection, fill.x2, fill.y2),
						scale = m.multiplyPoint(rotation, pf2.x - pf1.x, pf2.y - pf1.y).x;
					o = m.multiplyPoint(rotation, p.x - pf1.x, p.y - pf1.y).x / scale;
					break;
				case "radial":
					var dx = pt.x - fill.cx, dy = pt.y - fill.cy;
					o = Math.sqrt(dx * dx + dy * dy) / fill.r;
					break;
			}
			return findColor(o, fill.colors);	// dojo.Color
		}
		// simple color
		return new Color(fill || [0, 0, 0, 0]);	// dojo.Color
	};

	gradutils.reverse = function(fill){
		// summary:
		//		reverses a gradient
		// fill: Object:
		//		fill object
		if(fill){
			switch(fill.type){
				case "linear":
				case "radial":
					fill = lang.delegate(fill);
					if(fill.colors){
						var c = fill.colors, l = c.length, i = 0, stop,
							n = fill.colors = new Array(c.length);
						for(; i < l; ++i){
							stop = c[i];
							n[i] = {
								offset: 1 - stop.offset,
								color:  stop.color
							};
						}
						n.sort(function(a, b){ return a.offset - b.offset; });
					}
					break;
			}
		}
		return fill;	// Object
	};

	return gradutils;
});

},
'dojo/_base/url':function(){
define(["./kernel"], function(dojo) {
	// module:
	//		dojo/url
	// summary:
	//		This module contains dojo._Url

	var
		ore = new RegExp("^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\\?([^#]*))?(#(.*))?$"),
		ire = new RegExp("^((([^\\[:]+):)?([^@]+)@)?(\\[([^\\]]+)\\]|([^\\[:]*))(:([0-9]+))?$"),
		_Url = function(){
			var n = null,
				_a = arguments,
				uri = [_a[0]];
			// resolve uri components relative to each other
			for(var i = 1; i<_a.length; i++){
				if(!_a[i]){ continue; }

				// Safari doesn't support this.constructor so we have to be explicit
				// FIXME: Tracked (and fixed) in Webkit bug 3537.
				//		http://bugs.webkit.org/show_bug.cgi?id=3537
				var relobj = new _Url(_a[i]+""),
					uriobj = new _Url(uri[0]+"");

				if(
					relobj.path == "" &&
					!relobj.scheme &&
					!relobj.authority &&
					!relobj.query
				){
					if(relobj.fragment != n){
						uriobj.fragment = relobj.fragment;
					}
					relobj = uriobj;
				}else if(!relobj.scheme){
					relobj.scheme = uriobj.scheme;

					if(!relobj.authority){
						relobj.authority = uriobj.authority;

						if(relobj.path.charAt(0) != "/"){
							var path = uriobj.path.substring(0,
								uriobj.path.lastIndexOf("/") + 1) + relobj.path;

							var segs = path.split("/");
							for(var j = 0; j < segs.length; j++){
								if(segs[j] == "."){
									// flatten "./" references
									if(j == segs.length - 1){
										segs[j] = "";
									}else{
										segs.splice(j, 1);
										j--;
									}
								}else if(j > 0 && !(j == 1 && segs[0] == "") &&
									segs[j] == ".." && segs[j-1] != ".."){
									// flatten "../" references
									if(j == (segs.length - 1)){
										segs.splice(j, 1);
										segs[j - 1] = "";
									}else{
										segs.splice(j - 1, 2);
										j -= 2;
									}
								}
							}
							relobj.path = segs.join("/");
						}
					}
				}

				uri = [];
				if(relobj.scheme){
					uri.push(relobj.scheme, ":");
				}
				if(relobj.authority){
					uri.push("//", relobj.authority);
				}
				uri.push(relobj.path);
				if(relobj.query){
					uri.push("?", relobj.query);
				}
				if(relobj.fragment){
					uri.push("#", relobj.fragment);
				}
			}

			this.uri = uri.join("");

			// break the uri into its main components
			var r = this.uri.match(ore);

			this.scheme = r[2] || (r[1] ? "" : n);
			this.authority = r[4] || (r[3] ? "" : n);
			this.path = r[5]; // can never be undefined
			this.query = r[7] || (r[6] ? "" : n);
			this.fragment	 = r[9] || (r[8] ? "" : n);

			if(this.authority != n){
				// server based naming authority
				r = this.authority.match(ire);

				this.user = r[3] || n;
				this.password = r[4] || n;
				this.host = r[6] || r[7]; // ipv6 || ipv4
				this.port = r[9] || n;
			}
		};
	_Url.prototype.toString = function(){ return this.uri; };

	return dojo._Url = _Url;
});

},
'dojo/string':function(){
define(["./_base/kernel", "./_base/lang"], function(dojo, lang) {
	// module:
	//		dojo/string
	// summary:
	//		TODOC

lang.getObject("string", true, dojo);

/*=====
dojo.string = {
	// summary: String utilities for Dojo
};
=====*/

dojo.string.rep = function(/*String*/str, /*Integer*/num){
	// summary:
	//		Efficiently replicate a string `n` times.
	// str:
	//		the string to replicate
	// num:
	//		number of times to replicate the string

	if(num <= 0 || !str){ return ""; }

	var buf = [];
	for(;;){
		if(num & 1){
			buf.push(str);
		}
		if(!(num >>= 1)){ break; }
		str += str;
	}
	return buf.join("");	// String
};

dojo.string.pad = function(/*String*/text, /*Integer*/size, /*String?*/ch, /*Boolean?*/end){
	// summary:
	//		Pad a string to guarantee that it is at least `size` length by
	//		filling with the character `ch` at either the start or end of the
	//		string. Pads at the start, by default.
	// text:
	//		the string to pad
	// size:
	//		length to provide padding
	// ch:
	//		character to pad, defaults to '0'
	// end:
	//		adds padding at the end if true, otherwise pads at start
	// example:
	//	|	// Fill the string to length 10 with "+" characters on the right.  Yields "Dojo++++++".
	//	|	dojo.string.pad("Dojo", 10, "+", true);

	if(!ch){
		ch = '0';
	}
	var out = String(text),
		pad = dojo.string.rep(ch, Math.ceil((size - out.length) / ch.length));
	return end ? out + pad : pad + out;	// String
};

dojo.string.substitute = function(	/*String*/		template,
									/*Object|Array*/map,
									/*Function?*/	transform,
									/*Object?*/		thisObject){
	// summary:
	//		Performs parameterized substitutions on a string. Throws an
	//		exception if any parameter is unmatched.
	// template:
	//		a string with expressions in the form `${key}` to be replaced or
	//		`${key:format}` which specifies a format function. keys are case-sensitive.
	// map:
	//		hash to search for substitutions
	// transform:
	//		a function to process all parameters before substitution takes
	//		place, e.g. mylib.encodeXML
	// thisObject:
	//		where to look for optional format function; default to the global
	//		namespace
	// example:
	//		Substitutes two expressions in a string from an Array or Object
	//	|	// returns "File 'foo.html' is not found in directory '/temp'."
	//	|	// by providing substitution data in an Array
	//	|	dojo.string.substitute(
	//	|		"File '${0}' is not found in directory '${1}'.",
	//	|		["foo.html","/temp"]
	//	|	);
	//	|
	//	|	// also returns "File 'foo.html' is not found in directory '/temp'."
	//	|	// but provides substitution data in an Object structure.  Dotted
	//	|	// notation may be used to traverse the structure.
	//	|	dojo.string.substitute(
	//	|		"File '${name}' is not found in directory '${info.dir}'.",
	//	|		{ name: "foo.html", info: { dir: "/temp" } }
	//	|	);
	// example:
	//		Use a transform function to modify the values:
	//	|	// returns "file 'foo.html' is not found in directory '/temp'."
	//	|	dojo.string.substitute(
	//	|		"${0} is not found in ${1}.",
	//	|		["foo.html","/temp"],
	//	|		function(str){
	//	|			// try to figure out the type
	//	|			var prefix = (str.charAt(0) == "/") ? "directory": "file";
	//	|			return prefix + " '" + str + "'";
	//	|		}
	//	|	);
	// example:
	//		Use a formatter
	//	|	// returns "thinger -- howdy"
	//	|	dojo.string.substitute(
	//	|		"${0:postfix}", ["thinger"], null, {
	//	|			postfix: function(value, key){
	//	|				return value + " -- howdy";
	//	|			}
	//	|		}
	//	|	);

	thisObject = thisObject || dojo.global;
	transform = transform ?
		lang.hitch(thisObject, transform) : function(v){ return v; };

	return template.replace(/\$\{([^\s\:\}]+)(?:\:([^\s\:\}]+))?\}/g,
		function(match, key, format){
			var value = lang.getObject(key, false, map);
			if(format){
				value = lang.getObject(format, false, thisObject).call(thisObject, value, key);
			}
			return transform(value, key).toString();
		}); // String
};

/*=====
dojo.string.trim = function(str){
	// summary:
	//		Trims whitespace from both sides of the string
	// str: String
	//		String to be trimmed
	// returns: String
	//		Returns the trimmed string
	// description:
	//		This version of trim() was taken from [Steven Levithan's blog](http://blog.stevenlevithan.com/archives/faster-trim-javascript).
	//		The short yet performant version of this function is dojo.trim(),
	//		which is part of Dojo base.  Uses String.prototype.trim instead, if available.
	return "";	// String
}
=====*/

dojo.string.trim = String.prototype.trim ?
	lang.trim : // aliasing to the native function
	function(str){
		str = str.replace(/^\s+/, '');
		for(var i = str.length - 1; i >= 0; i--){
			if(/\S/.test(str.charAt(i))){
				str = str.substring(0, i + 1);
				break;
			}
		}
		return str;
	};

return dojo.string;
});

},
'dojo/domReady':function(){
define(['./has'], function(has){
	var global = this,
		doc = document,
		readyStates = { 'loaded': 1, 'complete': 1 },
		fixReadyState = typeof doc.readyState != "string",
		ready = !!readyStates[doc.readyState];

	// For FF <= 3.5
	if(fixReadyState){ doc.readyState = "loading"; }

	if(!ready){
		var readyQ = [], tests = [],
			detectReady = function(evt){
				evt = evt || global.event;
				if(ready || (evt.type == "readystatechange" && !readyStates[doc.readyState])){ return; }
				ready = 1;

				// For FF <= 3.5
				if(fixReadyState){ doc.readyState = "complete"; }

				while(readyQ.length){
					(readyQ.shift())();
				}
			},
			on = function(node, event){
				node.addEventListener(event, detectReady, false);
				readyQ.push(function(){ node.removeEventListener(event, detectReady, false); });
			};

		if(!has("dom-addeventlistener")){
			on = function(node, event){
				event = "on" + event;
				node.attachEvent(event, detectReady);
				readyQ.push(function(){ node.detachEvent(event, detectReady); });
			};

			var div = doc.createElement("div");
			try{
				if(div.doScroll && global.frameElement === null){
					// the doScroll test is only useful if we're in the top-most frame
					tests.push(function(){
						// Derived with permission from Diego Perini's IEContentLoaded
						// http://javascript.nwbox.com/IEContentLoaded/
						try{
							div.doScroll("left");
							return 1;
						}catch(e){}
					});
				}
			}catch(e){}
		}

		on(doc, "DOMContentLoaded");
		on(global, "load");

		if("onreadystatechange" in doc){
			on(doc, "readystatechange");
		}else if(!fixReadyState){
			// if the ready state property exists and there's
			// no readystatechange event, poll for the state
			// to change
			tests.push(function(){
				return readyStates[doc.readyState];
			});
		}

		if(tests.length){
			var poller = function(){
				if(ready){ return; }
				var i = tests.length;
				while(i--){
					if(tests[i]()){
						detectReady("poller");
						return;
					}
				}
				setTimeout(poller, 30);
			};
			poller();
		}
	}

	function domReady(callback){
		if(ready){
			callback(1);
		}else{
			readyQ.push(callback);
		}
	}
	domReady.load = function(id, req, load){
		domReady(load);
	};

	return domReady;
});

},
'dojox/charting/themes/Claro':function(){
define("dojox/charting/themes/Claro", ["../Theme", "dojox/gfx/gradutils", "./common"], function(Theme, gradutils, themes){
	// created by Tom Trenka

	var g = Theme.generateGradient,
		defaultFill = {type: "linear", space: "shape", x1: 0, y1: 0, x2: 0, y2: 100};
	
	themes.Claro = new Theme({
		chart: {
			fill:	   {
				type: "linear",
				x1: 0, x2: 0, y1: 0, y2: 100,
				colors: [
					{ offset: 0, color: "#dbdbdb" },
					{ offset: 1, color: "#efefef" }
				]
			},
			stroke:    {color: "#b5bcc7"}
		},
		plotarea: {
			fill:	   {
				type: "linear",
				x1: 0, x2: 0, y1: 0, y2: 100,
				colors: [
					{ offset: 0, color: "#dbdbdb" },
					{ offset: 1, color: "#efefef" }
				]
			}
		},
		axis:{
			stroke:	{ // the axis itself
				color: "#888c76",
				width: 1
			},
			tick: {	// used as a foundation for all ticks
				color:     "#888c76",
				position:  "center",
				font:      "normal normal normal 7pt Verdana, Arial, sans-serif",	// labels on axis
				fontColor: "#888c76"								// color of labels
			}
		},
		series: {
			stroke:  {width: 2.5, color: "#fff"},
			outline: null,
			font: "normal normal normal 7pt Verdana, Arial, sans-serif",
			fontColor: "#131313"
		},
		marker: {
			stroke:  {width: 1.25, color: "#131313"},
			outline: {width: 1.25, color: "#131313"},
			font: "normal normal normal 8pt Verdana, Arial, sans-serif",
			fontColor: "#131313"
		},
		seriesThemes: [
			{fill: g(defaultFill, "#2a6ead", "#3a99f2")},
			{fill: g(defaultFill, "#613e04", "#996106")},
			{fill: g(defaultFill, "#0e3961", "#155896")},
			{fill: g(defaultFill, "#55aafa", "#3f7fba")},
			{fill: g(defaultFill, "#ad7b2a", "#db9b35")}
		],
		markerThemes: [
			{fill: "#2a6ead", stroke: {color: "#fff"}},
			{fill: "#613e04", stroke: {color: "#fff"}},
			{fill: "#0e3961", stroke: {color: "#fff"}},
			{fill: "#55aafa", stroke: {color: "#fff"}},
			{fill: "#ad7b2a", stroke: {color: "#fff"}}
		]
	});
	
	themes.Claro.next = function(elementType, mixin, doPost){
		var isLine = elementType == "line";
		if(isLine || elementType == "area"){
			// custom processing for lines: substitute colors
			var s = this.seriesThemes[this._current % this.seriesThemes.length],
				m = this.markerThemes[this._current % this.markerThemes.length];
			s.fill.space = "plot";
			if(isLine){
				s.stroke  = { width: 4, color: s.fill.colors[0].color};
			}
			m.outline = { width: 1.25, color: m.fill };
			var theme = Theme.prototype.next.apply(this, arguments);
			// cleanup
			delete s.outline;
			delete s.stroke;
			s.fill.space = "shape";
			return theme;
		}
		else if(elementType == "candlestick"){
			var s = this.seriesThemes[this._current % this.seriesThemes.length];
			s.fill.space = "plot";
			s.stroke  = { width: 1, color: s.fill.colors[0].color};
			var theme = Theme.prototype.next.apply(this, arguments);
			return theme;
		}
		return Theme.prototype.next.apply(this, arguments);
	};
	
	themes.Claro.post = function(theme, elementType){
		theme = Theme.prototype.post.apply(this, arguments);
		if((elementType == "slice" || elementType == "circle") && theme.series.fill && theme.series.fill.type == "radial"){
			theme.series.fill = gradutils.reverse(theme.series.fill);
		}
		return theme;
	};
	
	return themes.Claro;
});

},
'dojo/dom-prop':function(){
define("dojo/dom-prop", ["exports", "./_base/kernel", "./_base/sniff", "./_base/lang", "./dom", "./dom-style", "./dom-construct", "./_base/connect"],
		function(exports, dojo, has, lang, dom, style, ctr, conn){
	// module:
	//		dojo/dom-prop
	// summary:
	//		This module defines the core dojo DOM properties API.
	//      Indirectly depends on dojo.empty() and dojo.toDom().

	// =============================
	// Element properties Functions
	// =============================

	/*=====
	prop.get = function(node, name){
		// summary:
		//		Gets a property on an HTML element.
		// description:
		//		Handles normalized getting of properties on DOM nodes.
		//
		// node: DOMNode|String
		//		id or reference to the element to get the property on
		// name: String
		//		the name of the property to get.
		// returns:
		//		the value of the requested property or its default value
		//
		// example:
		//	|	// get the current value of the "foo" property on a node
		//	|	dojo.getProp(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.getProp("nodeId", "foo");
	};
	=====*/

	/*=====
	prop.set = function(node, name, value){
		// summary:
		//		Sets a property on an HTML element.
		// description:
		//		Handles normalized setting of properties on DOM nodes.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node: DOMNode|String
		//		id or reference to the element to set the property on
		// name: String|Object
		//		the name of the property to set, or a hash object to set
		//		multiple properties at once.
		// value: String?
		//		The value to set for the property
		// returns:
		//		the DOM node
		//
		// example:
		//	|	// use prop() to set the tab index
		//	|	dojo.setProp("nodeId", "tabIndex", 3);
		//	|
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.setProp("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//	Style is s special case: Only set with an object hash of styles
		//	|	dojo.setProp("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//	Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.setProp("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.style("someNode", obj);
	};
	=====*/

	// helper to connect events
	var _evtHdlrMap = {}, _ctr = 0, _attrId = dojo._scopeName + "attrid";

		// the next dictionary lists elements with read-only innerHTML on IE
	var _roInnerHtml = {col: 1, colgroup: 1,
			// frameset: 1, head: 1, html: 1, style: 1,
			table: 1, tbody: 1, tfoot: 1, thead: 1, tr: 1, title: 1};
	
	exports.names = {
		// properties renamed to avoid clashes with reserved words
		"class": "className",
		"for": "htmlFor",
		// properties written as camelCase
		tabindex: "tabIndex",
		readonly: "readOnly",
		colspan: "colSpan",
		frameborder: "frameBorder",
		rowspan: "rowSpan",
		valuetype: "valueType"
	};

	exports.get = function getProp(/*DOMNode|String*/node, /*String*/name){
		node = dom.byId(node);
		var lc = name.toLowerCase(), propName = exports.names[lc] || name;
		return node[propName];	// Anything
	};

	exports.set = function setProp(/*DOMNode|String*/node, /*String|Object*/name, /*String?*/value){
		node = dom.byId(node);
		var l = arguments.length;
		if(l == 2 && typeof name != "string"){ // inline'd type check
			// the object form of setter: the 2nd argument is a dictionary
			for(var x in name){
				exports.set(node, x, name[x]);
			}
			return node; // DomNode
		}
		var lc = name.toLowerCase(), propName = exports.names[lc] || name;
		if(propName == "style" && typeof value != "string"){ // inline'd type check
			// special case: setting a style
			style.style(node, value);
			return node; // DomNode
		}
		if(propName == "innerHTML"){
			// special case: assigning HTML
						if(has("ie") && node.tagName.toLowerCase() in _roInnerHtml){
				ctr.empty(node);
				node.appendChild(ctr.toDom(value, node.ownerDocument));
			}else{
							node[propName] = value;
						}
						return node; // DomNode
		}
		if(lang.isFunction(value)){
			// special case: assigning an event handler
			// clobber if we can
			var attrId = node[_attrId];
			if(!attrId){
				attrId = _ctr++;
				node[_attrId] = attrId;
			}
			if(!_evtHdlrMap[attrId]){
				_evtHdlrMap[attrId] = {};
			}
			var h = _evtHdlrMap[attrId][propName];
			if(h){
				//h.remove();
				conn.disconnect(h);
			}else{
				try{
					delete node[propName];
				}catch(e){}
			}
			// ensure that event objects are normalized, etc.
			if(value){
				//_evtHdlrMap[attrId][propName] = on(node, propName, value);
				_evtHdlrMap[attrId][propName] = conn.connect(node, propName, value);
			}else{
				node[propName] = null;
			}
			return node; // DomNode
		}
		node[propName] = value;
		return node;	// DomNode
	};
});

},
'dojo/keys':function(){
define("dojo/keys", ["./_base/kernel", "./_base/sniff"], function(dojo, has) {
	// module:
	//		dojo/keys
	// summary:
	//		key constants
// Constants

// Public: client code should test
// keyCode against these named constants, as the
// actual codes can vary by browser.
return dojo.keys = {
	// summary:
	//		Definitions for common key values
	BACKSPACE: 8,
	TAB: 9,
	CLEAR: 12,
	ENTER: 13,
	SHIFT: 16,
	CTRL: 17,
	ALT: 18,
	META: has("safari") ? 91 : 224,		// the apple key on macs
	PAUSE: 19,
	CAPS_LOCK: 20,
	ESCAPE: 27,
	SPACE: 32,
	PAGE_UP: 33,
	PAGE_DOWN: 34,
	END: 35,
	HOME: 36,
	LEFT_ARROW: 37,
	UP_ARROW: 38,
	RIGHT_ARROW: 39,
	DOWN_ARROW: 40,
	INSERT: 45,
	DELETE: 46,
	HELP: 47,
	LEFT_WINDOW: 91,
	RIGHT_WINDOW: 92,
	SELECT: 93,
	NUMPAD_0: 96,
	NUMPAD_1: 97,
	NUMPAD_2: 98,
	NUMPAD_3: 99,
	NUMPAD_4: 100,
	NUMPAD_5: 101,
	NUMPAD_6: 102,
	NUMPAD_7: 103,
	NUMPAD_8: 104,
	NUMPAD_9: 105,
	NUMPAD_MULTIPLY: 106,
	NUMPAD_PLUS: 107,
	NUMPAD_ENTER: 108,
	NUMPAD_MINUS: 109,
	NUMPAD_PERIOD: 110,
	NUMPAD_DIVIDE: 111,
	F1: 112,
	F2: 113,
	F3: 114,
	F4: 115,
	F5: 116,
	F6: 117,
	F7: 118,
	F8: 119,
	F9: 120,
	F10: 121,
	F11: 122,
	F12: 123,
	F13: 124,
	F14: 125,
	F15: 126,
	NUM_LOCK: 144,
	SCROLL_LOCK: 145,
	UP_DPAD: 175,
	DOWN_DPAD: 176,
	LEFT_DPAD: 177,
	RIGHT_DPAD: 178,
	// virtual key mapping
	copyKey: has("mac") && !has("air") ? (has("safari") ? 91 : 224 ) : 17
};
});

},
'dojo/_base/lang':function(){
define(["./kernel", "../has", "./sniff"], function(dojo, has){
	//	module:
	//		dojo/_base/lang
	//	summary:
	//		This module defines Javascript language extensions.

	has.add("bug-for-in-skips-shadowed", function(){
		// if true, the for-in interator skips object properties that exist in Object's prototype (IE 6 - ?)
		for(var i in {toString: 1}){
			return 0;
		}
		return 1;
	});

	var _extraNames =
			has("bug-for-in-skips-shadowed") ?
				"hasOwnProperty.valueOf.isPrototypeOf.propertyIsEnumerable.toLocaleString.toString.constructor".split(".") : [],

		_extraLen = _extraNames.length,

		_mixin = function(dest, source, copyFunc){
			var name, s, i, empty = {};
			for(name in source){
				// the (!(name in empty) || empty[name] !== s) condition avoids copying properties in "source"
				// inherited from Object.prototype.	 For example, if dest has a custom toString() method,
				// don't overwrite it with the toString() method that source inherited from Object.prototype
				s = source[name];
				if(!(name in dest) || (dest[name] !== s && (!(name in empty) || empty[name] !== s))){
					dest[name] = copyFunc ? copyFunc(s) : s;
				}
			}

			if(has("bug-for-in-skips-shadowed")){
				if(source){
					for(i = 0; i < _extraLen; ++i){
						name = _extraNames[i];
						s = source[name];
						if(!(name in dest) || (dest[name] !== s && (!(name in empty) || empty[name] !== s))){
							dest[name] = copyFunc ? copyFunc(s) : s;
						}
					}
				}
			}

			return dest; // Object
		},

		mixin = function(dest, sources){
			if(!dest){ dest = {}; }
			for(var i = 1, l = arguments.length; i < l; i++){
				lang._mixin(dest, arguments[i]);
			}
			return dest; // Object
		},

		getProp = function(/*Array*/parts, /*Boolean*/create, /*Object*/context){
			var p, i = 0, dojoGlobal = dojo.global;
			if(!context){
				if(!parts.length){
					return dojoGlobal;
				}else{
					p = parts[i++];
					try{
						context = dojo.scopeMap[p] && dojo.scopeMap[p][1];
					}catch(e){}
					context = context || (p in dojoGlobal ? dojoGlobal[p] : (create ? dojoGlobal[p] = {} : undefined));
				}
			}
			while(context && (p = parts[i++])){
				context = (p in context ? context[p] : (create ? context[p] = {} : undefined));
			}
			return context; // mixed
		},

		setObject = function(name, value, context){
			var parts = name.split("."), p = parts.pop(), obj = getProp(parts, true, context);
			return obj && p ? (obj[p] = value) : undefined; // Object
		},

		getObject = function(name, create, context){
			return getProp(name.split("."), create, context); // Object
		},

		exists = function(name, obj){
			return lang.getObject(name, false, obj) !== undefined; // Boolean
		},

		opts = Object.prototype.toString,

		// Crockford (ish) functions

		isString = function(it){
			return (typeof it == "string" || it instanceof String); // Boolean
		},

		isArray = function(it){
			return it && (it instanceof Array || typeof it == "array"); // Boolean
		},

		isFunction = function(it){
			return opts.call(it) === "[object Function]";
		},

		isObject = function(it){
			return it !== undefined &&
				(it === null || typeof it == "object" || lang.isArray(it) || lang.isFunction(it)); // Boolean
		},

		isArrayLike = function(it){
			return it && it !== undefined && // Boolean
				// keep out built-in constructors (Number, String, ...) which have length
				// properties
				!lang.isString(it) && !lang.isFunction(it) &&
				!(it.tagName && it.tagName.toLowerCase() == 'form') &&
				(lang.isArray(it) || isFinite(it.length));
		},

		isAlien = function(it){
			return it && !lang.isFunction(it) && /\{\s*\[native code\]\s*\}/.test(String(it)); // Boolean
		},

		extend = function(constructor, props){
			for(var i=1, l=arguments.length; i<l; i++){
				lang._mixin(constructor.prototype, arguments[i]);
			}
			return constructor; // Object
		},

		_hitchArgs = function(scope, method){
			var pre = _toArray(arguments, 2);
			var named = lang.isString(method);
			return function(){
				// arrayify arguments
				var args = _toArray(arguments);
				// locate our method
				var f = named ? (scope||dojo.global)[method] : method;
				// invoke with collected args
				return f && f.apply(scope || this, pre.concat(args)); // mixed
			}; // Function
		},

		hitch = function(scope, method){
			if(arguments.length > 2){
				return lang._hitchArgs.apply(dojo, arguments); // Function
			}
			if(!method){
				method = scope;
				scope = null;
			}
			if(lang.isString(method)){
				scope = scope || dojo.global;
				if(!scope[method]){ throw(['dojo.hitch: scope["', method, '"] is null (scope="', scope, '")'].join('')); }
				return function(){ return scope[method].apply(scope, arguments || []); }; // Function
			}
			return !scope ? method : function(){ return method.apply(scope, arguments || []); }; // Function
		},

		delegate = (function(){
			// boodman/crockford delegation w/ cornford optimization
			function TMP(){}
			return function(obj, props){
				TMP.prototype = obj;
				var tmp = new TMP();
				TMP.prototype = null;
				if(props){
					lang._mixin(tmp, props);
				}
				return tmp; // Object
			};
		})(),

		efficient = function(obj, offset, startWith){
			return (startWith||[]).concat(Array.prototype.slice.call(obj, offset||0));
		},

		_toArray =
			has("ie") ?
				(function(){
					function slow(obj, offset, startWith){
						var arr = startWith||[];
						for(var x = offset || 0; x < obj.length; x++){
							arr.push(obj[x]);
						}
						return arr;
					}
					return function(obj){
						return ((obj.item) ? slow : efficient).apply(this, arguments);
					};
				})() : efficient,

		partial = function(/*Function|String*/method /*, ...*/){
			var arr = [ null ];
			return lang.hitch.apply(dojo, arr.concat(lang._toArray(arguments))); // Function
		},

		clone = function(/*anything*/ src){
			if(!src || typeof src != "object" || lang.isFunction(src)){
				// null, undefined, any non-object, or function
				return src;	// anything
			}
			if(src.nodeType && "cloneNode" in src){
				// DOM Node
				return src.cloneNode(true); // Node
			}
			if(src instanceof Date){
				// Date
				return new Date(src.getTime());	// Date
			}
			if(src instanceof RegExp){
				// RegExp
				return new RegExp(src);   // RegExp
			}
			var r, i, l;
			if(lang.isArray(src)){
				// array
				r = [];
				for(i = 0, l = src.length; i < l; ++i){
					if(i in src){
						r.push(clone(src[i]));
					}
				}
	// we don't clone functions for performance reasons
	//		}else if(d.isFunction(src)){
	//			// function
	//			r = function(){ return src.apply(this, arguments); };
			}else{
				// generic objects
				r = src.constructor ? new src.constructor() : {};
			}
			return lang._mixin(r, src, clone);
		},


		trim = String.prototype.trim ?
			function(str){ return str.trim(); } :
			function(str){ return str.replace(/^\s\s*/, '').replace(/\s\s*$/, ''); },


		_pattern = /\{([^\}]+)\}/g,

		replace = function(tmpl, map, pattern){
			return tmpl.replace(pattern || _pattern, lang.isFunction(map) ?
				map : function(_, k){ return getObject(k, false, map); });
		},

		lang = {
			_extraNames:_extraNames,
			_mixin:_mixin,
			mixin:mixin,
			setObject:setObject,
			getObject:getObject,
			exists:exists,
			isString:isString,
			isArray:isArray,
			isFunction:isFunction,
			isObject:isObject,
			isArrayLike:isArrayLike,
			isAlien:isAlien,
			extend:extend,
			_hitchArgs:_hitchArgs,
			hitch:hitch,
			delegate:delegate,
			_toArray:_toArray,
			partial:partial,
			clone:clone,
			trim:trim,
			replace:replace
		};

	1 && mixin(dojo, lang);
	return lang;

	/*=====
	dojo._extraNames
	// summary:
	//		Array of strings. Lists property names that must be explicitly processed during for-in interation
	//		in environments that have has("bug-for-in-skips-shadowed") true.
	=====*/

	/*=====
	dojo._mixin = function(dest, source, copyFunc){
		//	summary:
		//		Copies/adds all properties of source to dest; returns dest.
		//	dest: Object:
		//		The object to which to copy/add all properties contained in source.
		//	source: Object:
		//		The object from which to draw all properties to copy into dest.
		//	copyFunc: Function?:
		//		The process used to copy/add a property in source; defaults to the Javascript assignment operator.
		//	returns:
		//		dest, as modified
		//	description:
		//		All properties, including functions (sometimes termed "methods"), excluding any non-standard extensions
		//		found in Object.prototype, are copied/added to dest. Copying/adding each particular property is
		//		delegated to copyFunc (if any); copyFunc defaults to the Javascript assignment operator if not provided.
		//		Notice that by default, _mixin executes a so-called "shallow copy" and aggregate types are copied/added by reference.
	}
	=====*/

	/*=====
	dojo.mixin = function(dest, sources){
	//	summary:
	//		Copies/adds all properties of one or more sources to dest; returns dest.
	//	dest: Object
	//		The object to which to copy/add all properties contained in source. If dest is falsy, then
	//		a new object is manufactured before copying/adding properties begins.
	//	sources: Object...
	//		One of more objects from which to draw all properties to copy into dest. sources are processed
	//		left-to-right and if more than one of these objects contain the same property name, the right-most
	//		value "wins".
	//	returns: Object
	//		dest, as modified
	//	description:
	//		All properties, including functions (sometimes termed "methods"), excluding any non-standard extensions
	//		found in Object.prototype, are copied/added from sources to dest. sources are processed left to right.
	//		The Javascript assignment operator is used to copy/add each property; therefore, by default, mixin
	//		executes a so-called "shallow copy" and aggregate types are copied/added by reference.
	//	example:
	//		make a shallow copy of an object
	//	| var copy = lang.mixin({}, source);
	//	example:
	//		many class constructors often take an object which specifies
	//		values to be configured on the object. In this case, it is
	//		often simplest to call `lang.mixin` on the `this` object:
	//	| dojo.declare("acme.Base", null, {
	//	|		constructor: function(properties){
	//	|			// property configuration:
	//	|			lang.mixin(this, properties);
	//	|
	//	|			console.log(this.quip);
	//	|			//	...
	//	|		},
	//	|		quip: "I wasn't born yesterday, you know - I've seen movies.",
	//	|		// ...
	//	| });
	//	|
	//	| // create an instance of the class and configure it
	//	| var b = new acme.Base({quip: "That's what it does!" });
	//	example:
	//		copy in properties from multiple objects
	//	| var flattened = lang.mixin(
	//	|		{
	//	|			name: "Frylock",
	//	|			braces: true
	//	|		},
	//	|		{
	//	|			name: "Carl Brutanananadilewski"
	//	|		}
	//	| );
	//	|
	//	| // will print "Carl Brutanananadilewski"
	//	| console.log(flattened.name);
	//	| // will print "true"
	//	| console.log(flattened.braces);
	}
	=====*/

	/*=====
	dojo.setObject = function(name, value, context){
	// summary:
	//		Set a property from a dot-separated string, such as "A.B.C"
	//	description:
	//		Useful for longer api chains where you have to test each object in
	//		the chain, or when you have an object reference in string format.
	//		Objects are created as needed along `path`. Returns the passed
	//		value if setting is successful or `undefined` if not.
	//	name: String
	//		Path to a property, in the form "A.B.C".
	//	value: anything
	//		value or object to place at location given by name
	//	context: Object?
	//		Optional. Object to use as root of path. Defaults to
	//		`dojo.global`.
	//	example:
	//		set the value of `foo.bar.baz`, regardless of whether
	//		intermediate objects already exist:
	//	| lang.setObject("foo.bar.baz", value);
	//	example:
	//		without `lang.setObject`, we often see code like this:
	//	| // ensure that intermediate objects are available
	//	| if(!obj["parent"]){ obj.parent = {}; }
	//	| if(!obj.parent["child"]){ obj.parent.child = {}; }
	//	| // now we can safely set the property
	//	| obj.parent.child.prop = "some value";
	//		whereas with `lang.setObject`, we can shorten that to:
	//	| lang.setObject("parent.child.prop", "some value", obj);
	}
	=====*/

	/*=====
	dojo.getObject = function(name, create, context){
	// summary:
	//		Get a property from a dot-separated string, such as "A.B.C"
	//	description:
	//		Useful for longer api chains where you have to test each object in
	//		the chain, or when you have an object reference in string format.
	//	name: String
	//		Path to an property, in the form "A.B.C".
	//	create: Boolean?
	//		Optional. Defaults to `false`. If `true`, Objects will be
	//		created at any point along the 'path' that is undefined.
	//	context: Object?
	//		Optional. Object to use as root of path. Defaults to
	//		'dojo.global'. Null may be passed.
	}
	=====*/

	/*=====
	dojo.exists = function(name, obj){
	//	summary:
	//		determine if an object supports a given method
	//	description:
	//		useful for longer api chains where you have to test each object in
	//		the chain. Useful for object and method detection.
	//	name: String
	//		Path to an object, in the form "A.B.C".
	//	obj: Object?
	//		Object to use as root of path. Defaults to
	//		'dojo.global'. Null may be passed.
	//	example:
	//	| // define an object
	//	| var foo = {
	//	|		bar: { }
	//	| };
	//	|
	//	| // search the global scope
	//	| lang.exists("foo.bar"); // true
	//	| lang.exists("foo.bar.baz"); // false
	//	|
	//	| // search from a particular scope
	//	| lang.exists("bar", foo); // true
	//	| lang.exists("bar.baz", foo); // false
	}
	=====*/

	/*=====
	dojo.isString = function(it){
	//	summary:
	//		Return true if it is a String
	//	it: anything
	//		Item to test.
	}
	=====*/

	/*=====
	dojo.isArray = function(it){
	//	summary:
	//		Return true if it is an Array.
	//		Does not work on Arrays created in other windows.
	//	it: anything
	//		Item to test.
	}
	=====*/

	/*=====
	dojo.isFunction = function(it){
	// summary:
	//		Return true if it is a Function
	//	it: anything
	//		Item to test.
	}
	=====*/

	/*=====
	dojo.isObject = function(it){
	// summary:
	//		Returns true if it is a JavaScript object (or an Array, a Function
	//		or null)
	//	it: anything
	//		Item to test.
	}
	=====*/

	/*=====
	dojo.isArrayLike = function(it){
	//	summary:
	//		similar to dojo.isArray() but more permissive
	//	it: anything
	//		Item to test.
	//	returns:
	//		If it walks like a duck and quacks like a duck, return `true`
	//	description:
	//		Doesn't strongly test for "arrayness".  Instead, settles for "isn't
	//		a string or number and has a length property". Arguments objects
	//		and DOM collections will return true when passed to
	//		dojo.isArrayLike(), but will return false when passed to
	//		dojo.isArray().
	}
	=====*/

	/*=====
	dojo.isAlien = function(it){
	// summary:
	//		Returns true if it is a built-in function or some other kind of
	//		oddball that *should* report as a function but doesn't
	}
	=====*/

	/*=====
	dojo.extend = function(constructor, props){
	// summary:
	//		Adds all properties and methods of props to constructor's
	//		prototype, making them available to all instances created with
	//		constructor.
	//	constructor: Object
	//		Target constructor to extend.
	//	props: Object...
	//		One or more objects to mix into constructor.prototype
	}
	=====*/

	/*=====
	dojo.hitch = function(scope, method){
	//	summary:
	//		Returns a function that will only ever execute in the a given scope.
	//		This allows for easy use of object member functions
	//		in callbacks and other places in which the "this" keyword may
	//		otherwise not reference the expected scope.
	//		Any number of default positional arguments may be passed as parameters
	//		beyond "method".
	//		Each of these values will be used to "placehold" (similar to curry)
	//		for the hitched function.
	//	scope: Object
	//		The scope to use when method executes. If method is a string,
	//		scope is also the object containing method.
	//	method: Function|String...
	//		A function to be hitched to scope, or the name of the method in
	//		scope to be hitched.
	//	example:
	//	|	dojo.hitch(foo, "bar")();
	//		runs foo.bar() in the scope of foo
	//	example:
	//	|	dojo.hitch(foo, myFunction);
	//		returns a function that runs myFunction in the scope of foo
	//	example:
	//		Expansion on the default positional arguments passed along from
	//		hitch. Passed args are mixed first, additional args after.
	//	|	var foo = { bar: function(a, b, c){ console.log(a, b, c); } };
	//	|	var fn = dojo.hitch(foo, "bar", 1, 2);
	//	|	fn(3); // logs "1, 2, 3"
	//	example:
	//	|	var foo = { bar: 2 };
	//	|	dojo.hitch(foo, function(){ this.bar = 10; })();
	//		execute an anonymous function in scope of foo
	}
	=====*/

	/*=====
	dojo.delegate = function(obj, props){
		//	summary:
		//		Returns a new object which "looks" to obj for properties which it
		//		does not have a value for. Optionally takes a bag of properties to
		//		seed the returned object with initially.
		//	description:
		//		This is a small implementaton of the Boodman/Crockford delegation
		//		pattern in JavaScript. An intermediate object constructor mediates
		//		the prototype chain for the returned object, using it to delegate
		//		down to obj for property lookup when object-local lookup fails.
		//		This can be thought of similarly to ES4's "wrap", save that it does
		//		not act on types but rather on pure objects.
		//	obj: Object
		//		The object to delegate to for properties not found directly on the
		//		return object or in props.
		//	props: Object...
		//		an object containing properties to assign to the returned object
		//	returns:
		//		an Object of anonymous type
		//	example:
		//	|	var foo = { bar: "baz" };
		//	|	var thinger = dojo.delegate(foo, { thud: "xyzzy"});
		//	|	thinger.bar == "baz"; // delegated to foo
		//	|	foo.thud == undefined; // by definition
		//	|	thinger.thud == "xyzzy"; // mixed in from props
		//	|	foo.bar = "thonk";
		//	|	thinger.bar == "thonk"; // still delegated to foo's bar
	}
	=====*/

	/*=====
	dojo.partial = function(method){
	//	summary:
	//		similar to hitch() except that the scope object is left to be
	//		whatever the execution context eventually becomes.
	//	method: Function|String
	//	description:
	//		Calling dojo.partial is the functional equivalent of calling:
	//		|	dojo.hitch(null, funcName, ...);
	}
	=====*/

	/*=====
	dojo.trim = function(str){
		//	summary:
		//		Trims whitespace from both sides of the string
		//	str: String
		//		String to be trimmed
		//	returns: String
		//		Returns the trimmed string
		//	description:
		//		This version of trim() was selected for inclusion into the base due
		//		to its compact size and relatively good performance
		//		(see [Steven Levithan's blog](http://blog.stevenlevithan.com/archives/faster-trim-javascript)
		//		Uses String.prototype.trim instead, if available.
		//		The fastest but longest version of this function is located at
		//		dojo.string.trim()
	}
	=====*/

	/*=====
	dojo.clone = function(src){
	// summary:
	//		Clones objects (including DOM nodes) and all children.
	//		Warning: do not clone cyclic structures.
	//	src:
	//		The object to clone
	}
	=====*/

	/*=====
	dojo._toArray = function(obj, offset, startWith){
		//	summary:
		//		Converts an array-like object (i.e. arguments, DOMCollection) to an
		//		array. Returns a new Array with the elements of obj.
		//	obj: Object
		//		the object to "arrayify". We expect the object to have, at a
		//		minimum, a length property which corresponds to integer-indexed
		//		properties.
		//	offset: Number?
		//		the location in obj to start iterating from. Defaults to 0.
		//		Optional.
		//	startWith: Array?
		//		An array to pack with the properties of obj. If provided,
		//		properties in obj are appended at the end of startWith and
		//		startWith is the returned array.
	}
	=====*/

	/*=====
	dojo.replace = function(tmpl, map, pattern){
		//	summary:
		//		Performs parameterized substitutions on a string. Throws an
		//		exception if any parameter is unmatched.
		//	tmpl: String
		//		String to be used as a template.
		//	map: Object|Function
		//		If an object, it is used as a dictionary to look up substitutions.
		//		If a function, it is called for every substitution with following
		//		parameters: a whole match, a name, an offset, and the whole template
		//		string (see https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Global_Objects/String/replace
		//		for more details).
		//	pattern: RegEx?
		//		Optional regular expression objects that overrides the default pattern.
		//		Must be global and match one item. The default is: /\{([^\}]+)\}/g,
		//		which matches patterns like that: "{xxx}", where "xxx" is any sequence
		//		of characters, which doesn't include "}".
		//	returns: String
		//		Returns the substituted string.
		//	example:
		//	|	// uses a dictionary for substitutions:
		//	|	dojo.replace("Hello, {name.first} {name.last} AKA {nick}!",
		//	|		{
		//	|			nick: "Bob",
		//	|			name: {
		//	|				first:	"Robert",
		//	|				middle: "X",
		//	|				last:		"Cringely"
		//	|			}
		//	|		});
		//	|	// returns: Hello, Robert Cringely AKA Bob!
		//	example:
		//	|	// uses an array for substitutions:
		//	|	dojo.replace("Hello, {0} {2}!",
		//	|		["Robert", "X", "Cringely"]);
		//	|	// returns: Hello, Robert Cringely!
		//	example:
		//	|	// uses a function for substitutions:
		//	|	function sum(a){
		//	|		var t = 0;
		//	|		dojo.forEach(a, function(x){ t += x; });
		//	|		return t;
		//	|	}
		//	|	dojo.replace(
		//	|		"{count} payments averaging {avg} USD per payment.",
		//	|		dojo.hitch(
		//	|			{ payments: [11, 16, 12] },
		//	|			function(_, key){
		//	|				switch(key){
		//	|					case "count": return this.payments.length;
		//	|					case "min":		return Math.min.apply(Math, this.payments);
		//	|					case "max":		return Math.max.apply(Math, this.payments);
		//	|					case "sum":		return sum(this.payments);
		//	|					case "avg":		return sum(this.payments) / this.payments.length;
		//	|				}
		//	|			}
		//	|		)
		//	|	);
		//	|	// prints: 3 payments averaging 13 USD per payment.
		//	example:
		//	|	// uses an alternative PHP-like pattern for substitutions:
		//	|	dojo.replace("Hello, ${0} ${2}!",
		//	|		["Robert", "X", "Cringely"], /\$\{([^\}]+)\}/g);
		//	|	// returns: Hello, Robert Cringely!
		return "";	// String
	}
	=====*/
});


},
'dojox/charting/plot2d/Lines':function(){
define("dojox/charting/plot2d/Lines", ["dojo/_base/declare", "./Default"], function(declare, Default){
/*=====
var Default = dojox.charting.plot2d.Default;
=====*/
	return declare("dojox.charting.plot2d.Lines", Default, {
		//	summary:
		//		A convenience constructor to create a typical line chart.
		constructor: function(){
			//	summary:
			//		Preset our default plot to be line-based.
			this.opt.lines = true;
		}
	});
});

},
'dojo/_base/Color':function(){
define(["./kernel", "./lang", "./array", "./config"], function(dojo, lang, ArrayUtil, config){

	var Color = dojo.Color = function(/*Array|String|Object*/ color){
		// summary:
		//		Takes a named string, hex string, array of rgb or rgba values,
		//		an object with r, g, b, and a properties, or another `dojo.Color` object
		//		and creates a new Color instance to work from.
		//
		// example:
		//		Work with a Color instance:
		//	 | var c = new dojo.Color();
		//	 | c.setColor([0,0,0]); // black
		//	 | var hex = c.toHex(); // #000000
		//
		// example:
		//		Work with a node's color:
		//	 | var color = dojo.style("someNode", "backgroundColor");
		//	 | var n = new dojo.Color(color);
		//	 | // adjust the color some
		//	 | n.r *= .5;
		//	 | console.log(n.toString()); // rgb(128, 255, 255);
		if(color){ this.setColor(color); }
	};

	/*=====
	lang.mixin(dojo.Color,{
		named:{
			// summary: Dictionary list of all CSS named colors, by name. Values are 3-item arrays with corresponding RG and B values.
		}
	});
	=====*/

	// FIXME:
	// there's got to be a more space-efficient way to encode or discover
	// these!! Use hex?
	Color.named = {
		"black":  [0,0,0],
		"silver": [192,192,192],
		"gray":	  [128,128,128],
		"white":  [255,255,255],
		"maroon": [128,0,0],
		"red":	  [255,0,0],
		"purple": [128,0,128],
		"fuchsia":[255,0,255],
		"green":  [0,128,0],
		"lime":	  [0,255,0],
		"olive":  [128,128,0],
		"yellow": [255,255,0],
		"navy":	  [0,0,128],
		"blue":	  [0,0,255],
		"teal":	  [0,128,128],
		"aqua":	  [0,255,255],
		"transparent": config.transparentColor || [0,0,0,0]
	};

	lang.extend(Color, {
		r: 255, g: 255, b: 255, a: 1,
		_set: function(r, g, b, a){
			var t = this; t.r = r; t.g = g; t.b = b; t.a = a;
		},
		setColor: function(/*Array|String|Object*/ color){
			// summary:
			//		Takes a named string, hex string, array of rgb or rgba values,
			//		an object with r, g, b, and a properties, or another `dojo.Color` object
			//		and sets this color instance to that value.
			//
			// example:
			//	|	var c = new dojo.Color(); // no color
			//	|	c.setColor("#ededed"); // greyish
			if(lang.isString(color)){
				Color.fromString(color, this);
			}else if(lang.isArray(color)){
				Color.fromArray(color, this);
			}else{
				this._set(color.r, color.g, color.b, color.a);
				if(!(color instanceof Color)){ this.sanitize(); }
			}
			return this;	// dojo.Color
		},
		sanitize: function(){
			// summary:
			//		Ensures the object has correct attributes
			// description:
			//		the default implementation does nothing, include dojo.colors to
			//		augment it with real checks
			return this;	// dojo.Color
		},
		toRgb: function(){
			// summary:
			//		Returns 3 component array of rgb values
			// example:
			//	|	var c = new dojo.Color("#000000");
			//	|	console.log(c.toRgb()); // [0,0,0]
			var t = this;
			return [t.r, t.g, t.b]; // Array
		},
		toRgba: function(){
			// summary:
			//		Returns a 4 component array of rgba values from the color
			//		represented by this object.
			var t = this;
			return [t.r, t.g, t.b, t.a];	// Array
		},
		toHex: function(){
			// summary:
			//		Returns a CSS color string in hexadecimal representation
			// example:
			//	|	console.log(new dojo.Color([0,0,0]).toHex()); // #000000
			var arr = ArrayUtil.map(["r", "g", "b"], function(x){
				var s = this[x].toString(16);
				return s.length < 2 ? "0" + s : s;
			}, this);
			return "#" + arr.join("");	// String
		},
		toCss: function(/*Boolean?*/ includeAlpha){
			// summary:
			//		Returns a css color string in rgb(a) representation
			// example:
			//	|	var c = new dojo.Color("#FFF").toCss();
			//	|	console.log(c); // rgb('255','255','255')
			var t = this, rgb = t.r + ", " + t.g + ", " + t.b;
			return (includeAlpha ? "rgba(" + rgb + ", " + t.a : "rgb(" + rgb) + ")";	// String
		},
		toString: function(){
			// summary:
			//		Returns a visual representation of the color
			return this.toCss(true); // String
		}
	});

	Color.blendColors = dojo.blendColors = function(
		/*dojo.Color*/ start,
		/*dojo.Color*/ end,
		/*Number*/ weight,
		/*dojo.Color?*/ obj
	){
		// summary:
		//		Blend colors end and start with weight from 0 to 1, 0.5 being a 50/50 blend,
		//		can reuse a previously allocated dojo.Color object for the result
		var t = obj || new Color();
		ArrayUtil.forEach(["r", "g", "b", "a"], function(x){
			t[x] = start[x] + (end[x] - start[x]) * weight;
			if(x != "a"){ t[x] = Math.round(t[x]); }
		});
		return t.sanitize();	// dojo.Color
	};

	Color.fromRgb = dojo.colorFromRgb = function(/*String*/ color, /*dojo.Color?*/ obj){
		// summary:
		//		Returns a `dojo.Color` instance from a string of the form
		//		"rgb(...)" or "rgba(...)". Optionally accepts a `dojo.Color`
		//		object to update with the parsed value and return instead of
		//		creating a new object.
		// returns:
		//		A dojo.Color object. If obj is passed, it will be the return value.
		var m = color.toLowerCase().match(/^rgba?\(([\s\.,0-9]+)\)/);
		return m && Color.fromArray(m[1].split(/\s*,\s*/), obj);	// dojo.Color
	};

	Color.fromHex = dojo.colorFromHex = function(/*String*/ color, /*dojo.Color?*/ obj){
		// summary:
		//		Converts a hex string with a '#' prefix to a color object.
		//		Supports 12-bit #rgb shorthand. Optionally accepts a
		//		`dojo.Color` object to update with the parsed value.
		//
		// returns:
		//		A dojo.Color object. If obj is passed, it will be the return value.
		//
		// example:
		//	 | var thing = dojo.colorFromHex("#ededed"); // grey, longhand
		//
		// example:
		//	| var thing = dojo.colorFromHex("#000"); // black, shorthand
		var t = obj || new Color(),
			bits = (color.length == 4) ? 4 : 8,
			mask = (1 << bits) - 1;
		color = Number("0x" + color.substr(1));
		if(isNaN(color)){
			return null; // dojo.Color
		}
		ArrayUtil.forEach(["b", "g", "r"], function(x){
			var c = color & mask;
			color >>= bits;
			t[x] = bits == 4 ? 17 * c : c;
		});
		t.a = 1;
		return t;	// dojo.Color
	};

	Color.fromArray = dojo.colorFromArray = function(/*Array*/ a, /*dojo.Color?*/ obj){
		// summary:
		//		Builds a `dojo.Color` from a 3 or 4 element array, mapping each
		//		element in sequence to the rgb(a) values of the color.
		// example:
		//		| var myColor = dojo.colorFromArray([237,237,237,0.5]); // grey, 50% alpha
		// returns:
		//		A dojo.Color object. If obj is passed, it will be the return value.
		var t = obj || new Color();
		t._set(Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]));
		if(isNaN(t.a)){ t.a = 1; }
		return t.sanitize();	// dojo.Color
	};

	Color.fromString = dojo.colorFromString = function(/*String*/ str, /*dojo.Color?*/ obj){
		// summary:
		//		Parses `str` for a color value. Accepts hex, rgb, and rgba
		//		style color values.
		// description:
		//		Acceptable input values for str may include arrays of any form
		//		accepted by dojo.colorFromArray, hex strings such as "#aaaaaa", or
		//		rgb or rgba strings such as "rgb(133, 200, 16)" or "rgba(10, 10,
		//		10, 50)"
		// returns:
		//		A dojo.Color object. If obj is passed, it will be the return value.
		var a = Color.named[str];
		return a && Color.fromArray(a, obj) || Color.fromRgb(str, obj) || Color.fromHex(str, obj);	// dojo.Color
	};

	return Color;
});

},
'dojo/mouse':function(){
define(["./_base/kernel", "./on", "./has", "./dom", "./_base/window"], function(dojo, on, has, dom, win){

	/*=====
	dojo.mouse = {
	// summary:
	//		This module provide mouse event handling utility functions and exports
	//		mouseenter and mouseleave event emulation.
	// enter: Synthetic Event
	//		This is an extension event for the mouseenter that IE provides, emulating the
	//		behavior on other browsers.
	// leave: Synthetic Event
	//		This is an extension event for the mouseleave that IE provides, emulating the
	//		behavior on other browsers.
	// isLeft: Function
	//		Test an event object (from a mousedown event) to see if the left button was pressed.
	// isMiddle: Function
	//		Test an event object (from a mousedown event) to see if the middle button was pressed.
	// isRight: Function
	//		Test an event object (from a mousedown event) to see if the right button was pressed.
	// example:
	//		To use these events, you register a mouseenter like this:
	//		|	define(["dojo/on", dojo/mouse"], function(on, mouse){
	//		|		on(targetNode, mouse.enter, function(event){
	//		|			dojo.addClass(targetNode, "highlighted");
	//		|		});
	//		|		on(targetNode, mouse.leave, function(event){
	//		|			dojo.removeClass(targetNode, "highlighted");
	//		|		});
	};
	======*/

    has.add("dom-quirks", win.doc && win.doc.compatMode == "BackCompat");
 	has.add("events-mouseenter", win.doc && "onmouseenter" in win.doc.createElement("div"));

	var mouseButtons;
	if(has("dom-quirks") || !has("dom-addeventlistener")){
		mouseButtons = {
			LEFT:   1,
			MIDDLE: 4,
			RIGHT:  2,
			// helper functions
			isButton: function(e, button){ return e.button & button; },
			isLeft:   function(e){ return e.button & 1; },
			isMiddle: function(e){ return e.button & 4; },
			isRight:  function(e){ return e.button & 2; }
		};
	}else{
		mouseButtons = {
			LEFT:   0,
			MIDDLE: 1,
			RIGHT:  2,
			// helper functions
			isButton: function(e, button){ return e.button == button; },
			isLeft:   function(e){ return e.button == 0; },
			isMiddle: function(e){ return e.button == 1; },
			isRight:  function(e){ return e.button == 2; }
		};
	}
	dojo.mouseButtons = mouseButtons;

/*=====
	dojo.mouseButtons = {
		// LEFT: Number
		//		Numeric value of the left mouse button for the platform.
		LEFT:   0,
		// MIDDLE: Number
		//		Numeric value of the middle mouse button for the platform.
		MIDDLE: 1,
		// RIGHT: Number
		//		Numeric value of the right mouse button for the platform.
		RIGHT:  2,

		isButton: function(e, button){
			// summary:
			//		Checks an event object for a pressed button
			// e: Event
			//		Event object to examine
			// button: Number
			//		The button value (example: dojo.mouseButton.LEFT)
			return e.button == button; // Boolean
		},
		isLeft: function(e){
			// summary:
			//		Checks an event object for the pressed left button
			// e: Event
			//		Event object to examine
			return e.button == 0; // Boolean
		},
		isMiddle: function(e){
			// summary:
			//		Checks an event object for the pressed middle button
			// e: Event
			//		Event object to examine
			return e.button == 1; // Boolean
		},
		isRight: function(e){
			// summary:
			//		Checks an event object for the pressed right button
			// e: Event
			//		Event object to examine
			return e.button == 2; // Boolean
		}
	};
=====*/

	function eventHandler(type, mustBubble){
		// emulation of mouseenter/leave with mouseover/out using descendant checking
		var handler = function(node, listener){
			return on(node, type, function(evt){
				if(!dom.isDescendant(evt.relatedTarget, mustBubble ? evt.target : node)){
					return listener.call(this, evt);
				}
			});
		};
		if(!mustBubble){
			handler.bubble = eventHandler(type, true);
		}
		return handler;
	}
	return {
		enter: eventHandler("mouseover"),
		leave: eventHandler("mouseout"),
		isLeft: mouseButtons.isLeft,
		isMiddle: mouseButtons.isMiddle,
		isRight: mouseButtons.isRight
	};
});

},
'dojox/color/Palette':function(){
define("dojox/color/Palette", ["dojo/_base/kernel", "../main", "dojo/_base/lang", "dojo/_base/array", "./_base"], 
	function(dojo, dojox, lang, arr, dxc){

	/***************************************************************
	*	dojox.color.Palette
	*
	*	The Palette object is loosely based on the color palettes
	*	at Kuler (http://kuler.adobe.com).  They are 5 color palettes
	*	with the base color considered to be the third color in the
	*	palette (for generation purposes).
	*
	*	Palettes can be generated from well-known algorithms or they
	* 	can be manually created by passing an array to the constructor.
	*
	*	Palettes can be transformed, using a set of specific params
	*	similar to the way shapes can be transformed with dojox.gfx.
	*	However, unlike with transformations in dojox.gfx, transforming
	* 	a palette will return you a new Palette object, in effect
	* 	a clone of the original.
	***************************************************************/

	//	ctor ----------------------------------------------------------------------------
	dxc.Palette = function(/* String|Array|dojox.color.Color|dojox.color.Palette */base){
		//	summary:
		//		An object that represents a palette of colors.
		//	description:
		//		A Palette is a representation of a set of colors.  While the standard
		//		number of colors contained in a palette is 5, it can really handle any
		//		number of colors.
		//
		//		A palette is useful for the ability to transform all the colors in it
		//		using a simple object-based approach.  In addition, you can generate
		//		palettes using dojox.color.Palette.generate; these generated palettes
		//		are based on the palette generators at http://kuler.adobe.com.
		//
		//	colors: dojox.color.Color[]
		//		The actual color references in this palette.
		this.colors = [];
		if(base instanceof dxc.Palette){
			this.colors = base.colors.slice(0);
		}
		else if(base instanceof dxc.Color){
			this.colors = [ null, null, base, null, null ];
		}
		else if(lang.isArray(base)){
			this.colors = arr.map(base.slice(0), function(item){
				if(lang.isString(item)){ return new dxc.Color(item); }
				return item;
			});
		}
		else if (lang.isString(base)){
			this.colors = [ null, null, new dxc.Color(base), null, null ];
		}
	}

	//	private functions ---------------------------------------------------------------

	//	transformations
	function tRGBA(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var r=(param=="dr")?item.r+val:item.r,
				g=(param=="dg")?item.g+val:item.g,
				b=(param=="db")?item.b+val:item.b,
				a=(param=="da")?item.a+val:item.a
			ret.colors.push(new dxc.Color({
				r: Math.min(255, Math.max(0, r)),
				g: Math.min(255, Math.max(0, g)),
				b: Math.min(255, Math.max(0, b)),
				a: Math.min(1, Math.max(0, a))
			}));
		});
		return ret;
	}

	function tCMY(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toCmy(),
				c=(param=="dc")?o.c+val:o.c,
				m=(param=="dm")?o.m+val:o.m,
				y=(param=="dy")?o.y+val:o.y;
			ret.colors.push(dxc.fromCmy(
				Math.min(100, Math.max(0, c)),
				Math.min(100, Math.max(0, m)),
				Math.min(100, Math.max(0, y))
			));
		});
		return ret;
	}

	function tCMYK(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toCmyk(),
				c=(param=="dc")?o.c+val:o.c,
				m=(param=="dm")?o.m+val:o.m,
				y=(param=="dy")?o.y+val:o.y,
				k=(param=="dk")?o.b+val:o.b;
			ret.colors.push(dxc.fromCmyk(
				Math.min(100, Math.max(0, c)),
				Math.min(100, Math.max(0, m)),
				Math.min(100, Math.max(0, y)),
				Math.min(100, Math.max(0, k))
			));
		});
		return ret;
	}

	function tHSL(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toHsl(),
				h=(param=="dh")?o.h+val:o.h,
				s=(param=="ds")?o.s+val:o.s,
				l=(param=="dl")?o.l+val:o.l;
			ret.colors.push(dxc.fromHsl(h%360, Math.min(100, Math.max(0, s)), Math.min(100, Math.max(0, l))));
		});
		return ret;
	}

	function tHSV(p, param, val){
		var ret = new dxc.Palette();
		ret.colors = [];
		arr.forEach(p.colors, function(item){
			var o=item.toHsv(),
				h=(param=="dh")?o.h+val:o.h,
				s=(param=="ds")?o.s+val:o.s,
				v=(param=="dv")?o.v+val:o.v;
			ret.colors.push(dxc.fromHsv(h%360, Math.min(100, Math.max(0, s)), Math.min(100, Math.max(0, v))));
		});
		return ret;
	}

	//	helper functions
	function rangeDiff(val, low, high){
		//	given the value in a range from 0 to high, find the equiv
		//		using the range low to high.
		return high-((high-val)*((high-low)/high));
	}

	//	object methods ---------------------------------------------------------------
	lang.extend(dxc.Palette, {
		transform: function(/* dojox.color.Palette.__transformArgs */kwArgs){
			//	summary:
			//		Transform the palette using a specific transformation function
			//		and a set of transformation parameters.
			//	description:
			//		{palette}.transform is a simple way to uniformly transform
			//		all of the colors in a palette using any of 5 formulae:
			//		RGBA, HSL, HSV, CMYK or CMY.
			//
			//		Once the forumula to be used is determined, you can pass any
			//		number of parameters based on the formula "d"[param]; for instance,
			//		{ use: "rgba", dr: 20, dg: -50 } will take all of the colors in
			//		palette, add 20 to the R value and subtract 50 from the G value.
			//
			//		Unlike other types of transformations, transform does *not* alter
			//		the original palette but will instead return a new one.
			var fn=tRGBA;	//	the default transform function.
			if(kwArgs.use){
				//	we are being specific about the algo we want to use.
				var use=kwArgs.use.toLowerCase();
				if(use.indexOf("hs")==0){
					if(use.charAt(2)=="l"){ fn=tHSL; }
					else { fn=tHSV; }
				}
				else if(use.indexOf("cmy")==0){
					if(use.charAt(3)=="k"){ fn=tCMYK; }
					else { fn=tCMY; }
				}
			}
			//	try to guess the best choice.
			else if("dc" in kwArgs || "dm" in kwArgs || "dy" in kwArgs){
				if("dk" in kwArgs){ fn = tCMYK; }
				else { fn = tCMY; }
			}
			else if("dh" in kwArgs || "ds" in kwArgs){
				if("dv" in kwArgs){ fn = tHSV; }
				else { fn = tHSL; }
			}

			var palette = this;
			for(var p in kwArgs){
				//	ignore use
				if(p=="use"){ continue; }
				palette = fn(palette, p, kwArgs[p]);
			}
			return palette;		//	dojox.color.Palette
		},
		clone: function(){
			//	summary:
			//		Clones the current palette.
			return new dxc.Palette(this);	//	dojox.color.Palette
		}
	});

/*=====
dojox.color.Palette.__transformArgs = function(use, dr, dg, db, da, dc, dm, dy, dk, dh, ds, dv, dl){
	//	summary:
	//		The keywords argument to be passed to the dojox.color.Palette.transform function.  Note that
	//		while all arguments are optional, *some* arguments must be passed.  The basic concept is that
	//		you pass a delta value for a specific aspect of a color model (or multiple aspects of the same
	//		color model); for instance, if you wish to transform a palette based on the HSV color model,
	//		you would pass one of "dh", "ds", or "dv" as a value.
	//
	//	use: String?
	//		Specify the color model to use for the transformation.  Can be "rgb", "rgba", "hsv", "hsl", "cmy", "cmyk".
	//	dr: Number?
	//		The delta to be applied to the red aspect of the RGB/RGBA color model.
	//	dg: Number?
	//		The delta to be applied to the green aspect of the RGB/RGBA color model.
	//	db: Number?
	//		The delta to be applied to the blue aspect of the RGB/RGBA color model.
	//	da: Number?
	//		The delta to be applied to the alpha aspect of the RGBA color model.
	//	dc: Number?
	//		The delta to be applied to the cyan aspect of the CMY/CMYK color model.
	//	dm: Number?
	//		The delta to be applied to the magenta aspect of the CMY/CMYK color model.
	//	dy: Number?
	//		The delta to be applied to the yellow aspect of the CMY/CMYK color model.
	//	dk: Number?
	//		The delta to be applied to the black aspect of the CMYK color model.
	//	dh: Number?
	//		The delta to be applied to the hue aspect of the HSL/HSV color model.
	//	ds: Number?
	//		The delta to be applied to the saturation aspect of the HSL/HSV color model.
	//	dl: Number?
	//		The delta to be applied to the luminosity aspect of the HSL color model.
	//	dv: Number?
	//		The delta to be applied to the value aspect of the HSV color model.
	this.use = use;
	this.dr = dr;
	this.dg = dg;
	this.db = db;
	this.da = da;
	this.dc = dc;
	this.dm = dm;
	this.dy = dy;
	this.dk = dk;
	this.dh = dh;
	this.ds = ds;
	this.dl = dl;
	this.dv = dv;
}
dojox.color.Palette.__generatorArgs = function(base){
	//	summary:
	//		The keyword arguments object used to create a palette based on a base color.
	//
	//	base: dojo.Color
	//		The base color to be used to generate the palette.
	this.base = base;
}
dojox.color.Palette.__analogousArgs = function(base, high, low){
	//	summary:
	//		The keyword arguments object that is used to create a 5 color palette based on the
	//		analogous rules as implemented at http://kuler.adobe.com, using the HSV color model.
	//
	//	base: dojo.Color
	//		The base color to be used to generate the palette.
	//	high: Number?
	//		The difference between the hue of the base color and the highest hue.  In degrees, default is 60.
	//	low: Number?
	//		The difference between the hue of the base color and the lowest hue.  In degrees, default is 18.
	this.base = base;
	this.high = high;
	this.low = low;
}
dojox.color.Palette.__splitComplementaryArgs = function(base, da){
	//	summary:
	//		The keyword arguments object used to create a palette based on the split complementary rules
	//		as implemented at http://kuler.adobe.com.
	//
	//	base: dojo.Color
	//		The base color to be used to generate the palette.
	//	da: Number?
	//		The delta angle to be used to determine where the split for the complementary rules happen.
	//		In degrees, the default is 30.
	this.base = base;
	this.da = da;
}
=====*/
	lang.mixin(dxc.Palette, {
		generators: {
			analogous:function(/* dojox.color.Palette.__analogousArgs */args){
				//	summary:
				//		Create a 5 color palette based on the analogous rules as implemented at
				//		http://kuler.adobe.com.
				var high=args.high||60, 	//	delta between base hue and highest hue (subtracted from base)
					low=args.low||18,		//	delta between base hue and lowest hue (added to base)
					base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv=base.toHsv();

				//	generate our hue angle differences
				var h=[
					(hsv.h+low+360)%360,
					(hsv.h+Math.round(low/2)+360)%360,
					hsv.h,
					(hsv.h-Math.round(high/2)+360)%360,
					(hsv.h-high+360)%360
				];

				var s1=Math.max(10, (hsv.s<=95)?hsv.s+5:(100-(hsv.s-95))),
					s2=(hsv.s>1)?hsv.s-1:21-hsv.s,
					v1=(hsv.v>=92)?hsv.v-9:Math.max(hsv.v+9, 20),
					v2=(hsv.v<=90)?Math.max(hsv.v+5, 20):(95+Math.ceil((hsv.v-90)/2)),
					s=[ s1, s2, hsv.s, s1, s1 ],
					v=[ v1, v2, hsv.v, v1, v2 ]

				return new dxc.Palette(arr.map(h, function(hue, i){
					return dxc.fromHsv(hue, s[i], v[i]);
				}));		//	dojox.color.Palette
			},

			monochromatic: function(/* dojox.color.Palette.__generatorArgs */args){
				//	summary:
				//		Create a 5 color palette based on the monochromatic rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();
				
				//	figure out the saturation and value
				var s1 = (hsv.s-30>9)?hsv.s-30:hsv.s+30,
					s2 = hsv.s,
					v1 = rangeDiff(hsv.v, 20, 100),
					v2 = (hsv.v-20>20)?hsv.v-20:hsv.v+60,
					v3 = (hsv.v-50>20)?hsv.v-50:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(hsv.h, s1, v1),
					dxc.fromHsv(hsv.h, s2, v3),
					base,
					dxc.fromHsv(hsv.h, s1, v3),
					dxc.fromHsv(hsv.h, s2, v2)
				]);		//	dojox.color.Palette
			},

			triadic: function(/* dojox.color.Palette.__generatorArgs */args){
				//	summary:
				//		Create a 5 color palette based on the triadic rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = (hsv.h+57+360)%360,
					h2 = (hsv.h-157+360)%360,
					s1 = (hsv.s>20)?hsv.s-10:hsv.s+10,
					s2 = (hsv.s>90)?hsv.s-10:hsv.s+10,
					s3 = (hsv.s>95)?hsv.s-5:hsv.s+5,
					v1 = (hsv.v-20>20)?hsv.v-20:hsv.v+20,
					v2 = (hsv.v-30>20)?hsv.v-30:hsv.v+30,
					v3 = (hsv.v-30>70)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, hsv.v),
					dxc.fromHsv(hsv.h, s2, v2),
					base,
					dxc.fromHsv(h2, s2, v1),
					dxc.fromHsv(h2, s3, v3)
				]);		//	dojox.color.Palette
			},

			complementary: function(/* dojox.color.Palette.__generatorArgs */args){
				//	summary:
				//		Create a 5 color palette based on the complementary rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = ((hsv.h*2)+137<360)?(hsv.h*2)+137:Math.floor(hsv.h/2)-137,
					s1 = Math.max(hsv.s-10, 0),
					s2 = rangeDiff(hsv.s, 10, 100),
					s3 = Math.min(100, hsv.s+20),
					v1 = Math.min(100, hsv.v+30),
					v2 = (hsv.v>20)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(hsv.h, s1, v1),
					dxc.fromHsv(hsv.h, s2, v2),
					base,
					dxc.fromHsv(h1, s3, v2),
					dxc.fromHsv(h1, hsv.s, hsv.v)
				]);		//	dojox.color.Palette
			},

			splitComplementary: function(/* dojox.color.Palette.__splitComplementaryArgs */args){
				//	summary:
				//		Create a 5 color palette based on the split complementary rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					dangle = args.da || 30,
					hsv = base.toHsv();

				var baseh = ((hsv.h*2)+137<360)?(hsv.h*2)+137:Math.floor(hsv.h/2)-137,
					h1 = (baseh-dangle+360)%360,
					h2 = (baseh+dangle)%360,
					s1 = Math.max(hsv.s-10, 0),
					s2 = rangeDiff(hsv.s, 10, 100),
					s3 = Math.min(100, hsv.s+20),
					v1 = Math.min(100, hsv.v+30),
					v2 = (hsv.v>20)?hsv.v-30:hsv.v+30;

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, v1),
					dxc.fromHsv(h1, s2, v2),
					base,
					dxc.fromHsv(h2, s3, v2),
					dxc.fromHsv(h2, hsv.s, hsv.v)
				]);		//	dojox.color.Palette
			},

			compound: function(/* dojox.color.Palette.__generatorArgs */args){
				//	summary:
				//		Create a 5 color palette based on the compound rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var h1 = ((hsv.h*2)+18<360)?(hsv.h*2)+18:Math.floor(hsv.h/2)-18,
					h2 = ((hsv.h*2)+120<360)?(hsv.h*2)+120:Math.floor(hsv.h/2)-120,
					h3 = ((hsv.h*2)+99<360)?(hsv.h*2)+99:Math.floor(hsv.h/2)-99,
					s1 = (hsv.s-40>10)?hsv.s-40:hsv.s+40,
					s2 = (hsv.s-10>80)?hsv.s-10:hsv.s+10,
					s3 = (hsv.s-25>10)?hsv.s-25:hsv.s+25,
					v1 = (hsv.v-40>10)?hsv.v-40:hsv.v+40,
					v2 = (hsv.v-20>80)?hsv.v-20:hsv.v+20,
					v3 = Math.max(hsv.v, 20);

				return new dxc.Palette([
					dxc.fromHsv(h1, s1, v1),
					dxc.fromHsv(h1, s2, v2),
					base,
					dxc.fromHsv(h2, s3, v3),
					dxc.fromHsv(h3, s2, v2)
				]);		//	dojox.color.Palette
			},

			shades: function(/* dojox.color.Palette.__generatorArgs */args){
				//	summary:
				//		Create a 5 color palette based on the shades rules as implemented at
				//		http://kuler.adobe.com.
				var base = lang.isString(args.base)?new dxc.Color(args.base):args.base,
					hsv = base.toHsv();

				var s  = (hsv.s==100 && hsv.v==0)?0:hsv.s,
					v1 = (hsv.v-50>20)?hsv.v-50:hsv.v+30,
					v2 = (hsv.v-25>=20)?hsv.v-25:hsv.v+55,
					v3 = (hsv.v-75>=20)?hsv.v-75:hsv.v+5,
					v4 = Math.max(hsv.v-10, 20);

				return new dxc.Palette([
					new dxc.fromHsv(hsv.h, s, v1),
					new dxc.fromHsv(hsv.h, s, v2),
					base,
					new dxc.fromHsv(hsv.h, s, v3),
					new dxc.fromHsv(hsv.h, s, v4)
				]);		//	dojox.color.Palette
			}
		},
		generate: function(/* String|dojox.color.Color */base, /* Function|String */type){
			//	summary:
			//		Generate a new Palette using any of the named functions in
			//		dojox.color.Palette.generators or an optional function definition.  Current
			//		generators include "analogous", "monochromatic", "triadic", "complementary",
			//		"splitComplementary", and "shades".
			if(lang.isFunction(type)){
				return type({ base: base });	//	dojox.color.Palette
			}
			else if(dxc.Palette.generators[type]){
				return dxc.Palette.generators[type]({ base: base });	//	dojox.color.Palette
			}
			throw new Error("dojox.color.Palette.generate: the specified generator ('" + type + "') does not exist.");
		}
	});
	
	return dxc.Palette;
});

},
'dojox/charting/axis2d/Base':function(){
define("dojox/charting/axis2d/Base", ["dojo/_base/declare", "../Element"], 
	function(declare, Element){
/*=====
var Element = dojox.charting.Element;
=====*/ 
return declare("dojox.charting.axis2d.Base", Element, {
	//	summary:
	//		The base class for any axis.  This is more of an interface/API
	//		definition than anything else; see dojox.charting.axis2d.Default
	//		for more details.
	constructor: function(chart, kwArgs){
		//	summary:
		//		Return a new base axis.
		//	chart: dojox.charting.Chart
		//		The chart this axis belongs to.
		//	kwArgs: dojox.charting.axis2d.__AxisCtorArgs?
		//		An optional arguments object to define the axis parameters.
		this.vertical = kwArgs && kwArgs.vertical;
	},
	clear: function(){
		//	summary:
		//		Stub function for clearing the axis.
		//	returns: dojox.charting.axis2d.Base
		//		A reference to the axis for functional chaining.
		return this;	//	dojox.charting.axis2d.Base
	},
	initialized: function(){
		//	summary:
		//		Return a flag as to whether or not this axis has been initialized.
		//	returns: Boolean
		//		If the axis is initialized or not.
		return false;	//	Boolean
	},
	calculate: function(min, max, span){
		//	summary:
		//		Stub function to run the calcuations needed for drawing this axis.
		//	returns: dojox.charting.axis2d.Base
		//		A reference to the axis for functional chaining.
		return this;	//	dojox.charting.axis2d.Base
	},
	getScaler: function(){
		//	summary:
		//		A stub function to return the scaler object created during calculate.
		//	returns: Object
		//		The scaler object (see dojox.charting.scaler.linear for more information)
		return null;	//	Object
	},
	getTicks: function(){
		//	summary:
		//		A stub function to return the object that helps define how ticks are rendered.
		//	returns: Object
		//		The ticks object.
		return null;	//	Object
	},
	getOffsets: function(){
		//	summary:
		//		A stub function to return any offsets needed for axis and series rendering.
		//	returns: Object
		//		An object of the form { l, r, t, b }.
		return {l: 0, r: 0, t: 0, b: 0};	//	Object
	},
	render: function(dim, offsets){
		//	summary:
		//		Stub function to render this axis.
		//	returns: dojox.charting.axis2d.Base
		//		A reference to the axis for functional chaining.
		this.dirty = false;
		return this;	//	dojox.charting.axis2d.Base
	}
});
});

},
'dojox/gfx/utils':function(){
define("dojox/gfx/utils", ["dojo/_base/kernel","dojo/_base/lang","./_base", "dojo/_base/html","dojo/_base/array", "dojo/_base/window", "dojo/_base/json", 
	"dojo/_base/Deferred", "dojo/_base/sniff", "require","dojo/_base/config"], 
  function(kernel, lang, g, html, arr, win, jsonLib, Deferred, has, require, config){
	var gu = g.utils = {};
	/*===== g= dojox.gfx; gu = dojox.gfx.utils; =====*/

	lang.mixin(gu, {
		forEach: function(
			/*dojox.gfx.Surface|dojox.gfx.Shape*/ object,
			/*Function|String|Array*/ f, /*Object?*/ o
		){
			// summary:
			//		Takes a shape or a surface and applies a function "f" to in the context of "o" 
			//		(or global, if missing). If "shape" was a surface or a group, it applies the same 
			//		function to all children recursively effectively visiting all shapes of the underlying scene graph.
			// object : The gfx container to iterate.
			// f : The function to apply.
			// o : The scope.
			o = o || win.global;
			f.call(o, object);
			if(object instanceof g.Surface || object instanceof g.Group){
				arr.forEach(object.children, function(shape){
					gu.forEach(shape, f, o);
				});
			}
		},

		serialize: function(
			/* dojox.gfx.Surface|dojox.gfx.Shape */ object
		){
			// summary:
			//		Takes a shape or a surface and returns a DOM object, which describes underlying shapes.
			var t = {}, v, isSurface = object instanceof g.Surface;
			if(isSurface || object instanceof g.Group){
				t.children = arr.map(object.children, gu.serialize);
				if(isSurface){
					return t.children;	// Array
				}
			}else{
				t.shape = object.getShape();
			}
			if(object.getTransform){
				v = object.getTransform();
				if(v){ t.transform = v; }
			}
			if(object.getStroke){
				v = object.getStroke();
				if(v){ t.stroke = v; }
			}
			if(object.getFill){
				v = object.getFill();
				if(v){ t.fill = v; }
			}
			if(object.getFont){
				v = object.getFont();
				if(v){ t.font = v; }
			}
			return t;	// Object
		},

		toJson: function(
			/* dojox.gfx.Surface|dojox.gfx.Shape */ object,
			/* Boolean? */ prettyPrint
		){
			// summary:
			//		Works just like serialize() but returns a JSON string. If prettyPrint is true, the string is pretty-printed to make it more human-readable.
			return jsonLib.toJson(gu.serialize(object), prettyPrint);	// String
		},

		deserialize: function(
			/* dojox.gfx.Surface|dojox.gfx.Shape */ parent,
			/* dojox.gfx.Shape|Array */ object
		){
			// summary:
			//		Takes a surface or a shape and populates it with an object produced by serialize().
			if(object instanceof Array){
				return arr.map(object, lang.hitch(null, gu.deserialize, parent));	// Array
			}
			var shape = ("shape" in object) ? parent.createShape(object.shape) : parent.createGroup();
			if("transform" in object){
				shape.setTransform(object.transform);
			}
			if("stroke" in object){
				shape.setStroke(object.stroke);
			}
			if("fill" in object){
				shape.setFill(object.fill);
			}
			if("font" in object){
				shape.setFont(object.font);
			}
			if("children" in object){
				arr.forEach(object.children, lang.hitch(null, gu.deserialize, shape));
			}
			return shape;	// dojox.gfx.Shape
		},

		fromJson: function(
			/* dojox.gfx.Surface|dojox.gfx.Shape */ parent,
			/* String */ json){
			// summary:
			//		Works just like deserialize() but takes a JSON representation of the object.
			return gu.deserialize(parent, jsonLib.fromJson(json));	// Array || dojox.gfx.Shape
		},

		toSvg: function(/*GFX object*/surface){
			// summary:
			//		Function to serialize a GFX surface to SVG text.
			// description:
			//		Function to serialize a GFX surface to SVG text.  The value of this output
			//		is that there are numerous serverside parser libraries that can render
			//		SVG into images in various formats.  This provides a way that GFX objects
			//		can be captured in a known format and sent serverside for serialization
			//		into an image.
			// surface:
			//		The GFX surface to serialize.
			// returns:
			//		Deferred object that will be called when SVG serialization is complete.
		
			//Since the init and even surface creation can be async, we need to
			//return a deferred that will be called when content has serialized.
			var deferred = new Deferred();
		
			if(g.renderer === "svg"){
				//If we're already in SVG mode, this is easy and quick.
				try{
					var svg = gu._cleanSvg(gu._innerXML(surface.rawNode));
					deferred.callback(svg);
				}catch(e){
					deferred.errback(e);
				}
			}else{
				//Okay, now we have to get creative with hidden iframes and the like to
				//serialize SVG.
				if (!gu._initSvgSerializerDeferred) {
					gu._initSvgSerializer();
				}
				var jsonForm = gu.toJson(surface);
				var serializer = function(){
					try{
						var sDim = surface.getDimensions();
						var width = sDim.width;
						var	height = sDim.height;

						//Create an attach point in the iframe for the contents.
						var node = gu._gfxSvgProxy.document.createElement("div");
						gu._gfxSvgProxy.document.body.appendChild(node);
						//Set the node scaling.
						win.withDoc(gu._gfxSvgProxy.document, function() {
							html.style(node, "width", width);
							html.style(node, "height", height);
						}, this);

						//Create temp surface to render object to and render.
						var ts = gu._gfxSvgProxy[dojox._scopeName].gfx.createSurface(node, width, height);

						//It's apparently possible that a suface creation is async, so we need to use
						//the whenLoaded function.  Probably not needed for SVG, but making it common
						var draw = function(surface) {
							try{
								gu._gfxSvgProxy[dojox._scopeName].gfx.utils.fromJson(surface, jsonForm);

								//Get contents and remove temp surface.
								var svg = gu._cleanSvg(node.innerHTML);
								surface.clear();
								surface.destroy();
								gu._gfxSvgProxy.document.body.removeChild(node);
								deferred.callback(svg);
							}catch(e){
								deferred.errback(e);
							}
						};
						ts.whenLoaded(null,draw);
					 }catch (ex) {
						deferred.errback(ex);
					}
				};
				//See if we can call it directly or pass it to the deferred to be
				//called on initialization.
				if(gu._initSvgSerializerDeferred.fired > 0){
					serializer();
				}else{
					gu._initSvgSerializerDeferred.addCallback(serializer);
				}
			}
			return deferred; //dojo.Deferred that will be called when serialization finishes.
		},

		//iFrame document used for handling SVG serialization.
		_gfxSvgProxy: null,

		//Serializer loaded.
		_initSvgSerializerDeferred: null,

		_svgSerializerInitialized: function() {
			// summary:
			//		Internal function to call when the serializer init completed.
			// tags:
			//		private
			gu._initSvgSerializerDeferred.callback(true);
		},

		_initSvgSerializer: function(){
			// summary:
			//		Internal function to initialize the hidden iframe where SVG rendering
			//		will occur.
			// tags:
			//		private
			if(!gu._initSvgSerializerDeferred){
				gu._initSvgSerializerDeferred = new Deferred();
				var f = win.doc.createElement("iframe");
				html.style(f, {
					display: "none",
					position: "absolute",
					width: "1em",
					height: "1em",
					top: "-10000px"
				});
				var intv;
				if(has("ie")){
					f.onreadystatechange = function(){
						if(f.contentWindow.document.readyState == "complete"){
							f.onreadystatechange = function() {};
							intv = setInterval(function() {
								if(f.contentWindow[kernel.scopeMap["dojo"][1]._scopeName] &&
								   f.contentWindow[kernel.scopeMap["dojox"][1]._scopeName].gfx &&
								   f.contentWindow[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils){
									clearInterval(intv);
									f.contentWindow.parent[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils._gfxSvgProxy = f.contentWindow;
									f.contentWindow.parent[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils._svgSerializerInitialized();
								}
							}, 50);
						}
					};
				}else{
					f.onload = function(){
						f.onload = function() {};
						intv = setInterval(function() {
							if(f.contentWindow[kernel.scopeMap["dojo"][1]._scopeName] &&
							   f.contentWindow[kernel.scopeMap["dojox"][1]._scopeName].gfx &&
							   f.contentWindow[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils){
								clearInterval(intv);
								f.contentWindow.parent[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils._gfxSvgProxy = f.contentWindow;
								f.contentWindow.parent[kernel.scopeMap["dojox"][1]._scopeName].gfx.utils._svgSerializerInitialized();
							}
						}, 50);
					};
				}
				//We have to load the GFX SVG proxy frame.  Default is to use the one packaged in dojox.
				var uri = (config["dojoxGfxSvgProxyFrameUrl"]||require.toUrl("dojox/gfx/resources/gfxSvgProxyFrame.html"));
				f.setAttribute("src", uri.toString());
				win.body().appendChild(f);
			}
		},

		_innerXML: function(/*Node*/node){
			// summary:
			//		Implementation of MS's innerXML function, borrowed from dojox.xml.parser.
			// node:
			//		The node from which to generate the XML text representation.
			// tags:
			//		private
			if(node.innerXML){
				return node.innerXML;	//String
			}else if(node.xml){
				return node.xml;		//String
			}else if(typeof XMLSerializer != "undefined"){
				return (new XMLSerializer()).serializeToString(node);	//String
			}
			return null;
		},

		_cleanSvg: function(svg) {
			// summary:
			//		Internal function that cleans up artifacts in extracted SVG content.
			// tags:
			//		private
			if(svg){
				//Make sure the namespace is set.
				if(svg.indexOf("xmlns=\"http://www.w3.org/2000/svg\"") == -1){
					svg = svg.substring(4, svg.length);
					svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"" + svg;
				}
				//Same for xmlns:xlink (missing in Chrome and Safari)
				if(svg.indexOf("xmlns:xlink=\"http://www.w3.org/1999/xlink\"") == -1){
					svg = svg.substring(4, svg.length);
					svg = "<svg xmlns:xlink=\"http://www.w3.org/1999/xlink\"" + svg;
				}
				//and add namespace to href attribute if not done yet 
				//(FF 5+ adds xlink:href but not the xmlns def)
				if(svg.indexOf("xlink:href") === -1){
					svg = svg.replace(/href\s*=/g, "xlink:href=");
				}
				//Do some other cleanup, like stripping out the
				//dojoGfx attributes and quoting ids.
				svg = svg.replace(/\bdojoGfx\w*\s*=\s*(['"])\w*\1/g, "");
				svg = svg.replace(/\b__gfxObject__\s*=\s*(['"])\w*\1/g, "");
				svg = svg.replace(/[=]([^"']+?)(\s|>)/g,'="$1"$2');
			}
			return svg;  //Cleaned SVG text.
		}
	});

	return gu;
});

},
'dojox/lang/functional/fold':function(){
define("dojox/lang/functional/fold", ["dojo/_base/lang", "dojo/_base/array", "dojo/_base/window", "./lambda"],
	function(lang, arr, win, df){

// This module adds high-level functions and related constructs:
//	- "fold" family of functions

// Notes:
//	- missing high-level functions are provided with the compatible API:
//		foldl, foldl1, foldr, foldr1
//	- missing JS standard functions are provided with the compatible API:
//		reduce, reduceRight
//	- the fold's counterpart: unfold

// Defined methods:
//	- take any valid lambda argument as the functional argument
//	- operate on dense arrays
//	- take a string as the array argument
//	- take an iterator objects as the array argument (only foldl, foldl1, and reduce)

	var empty = {};

/*=====
	var df = dojox.lang.functional;
 =====*/
	lang.mixin(df, {
		// classic reduce-class functions
		foldl: function(/*Array|String|Object*/ a, /*Function*/ f, /*Object*/ z, /*Object?*/ o){
			// summary: repeatedly applies a binary function to an array from left
			//	to right using a seed value as a starting point; returns the final
			//	value.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var i, n;
			if(lang.isArray(a)){
				// array
				for(i = 0, n = a.length; i < n; z = f.call(o, z, a[i], i, a), ++i);
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				for(i = 0; a.hasNext(); z = f.call(o, z, a.next(), i++, a));
			}else{
				// object/dictionary
				for(i in a){
					if(!(i in empty)){
						z = f.call(o, z, a[i], i, a);
					}
				}
			}
			return z;	// Object
		},
		foldl1: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: repeatedly applies a binary function to an array from left
			//	to right; returns the final value.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var z, i, n;
			if(lang.isArray(a)){
				// array
				z = a[0];
				for(i = 1, n = a.length; i < n; z = f.call(o, z, a[i], i, a), ++i);
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				if(a.hasNext()){
					z = a.next();
					for(i = 1; a.hasNext(); z = f.call(o, z, a.next(), i++, a));
				}
			}else{
				// object/dictionary
				var first = true;
				for(i in a){
					if(!(i in empty)){
						if(first){
							z = a[i];
							first = false;
						}else{
							z = f.call(o, z, a[i], i, a);
						}
					}
				}
			}
			return z;	// Object
		},
		foldr: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object*/ z, /*Object?*/ o){
			// summary: repeatedly applies a binary function to an array from right
			//	to left using a seed value as a starting point; returns the final
			//	value.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			for(var i = a.length; i > 0; --i, z = f.call(o, z, a[i], i, a));
			return z;	// Object
		},
		foldr1: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: repeatedly applies a binary function to an array from right
			//	to left; returns the final value.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var n = a.length, z = a[n - 1], i = n - 1;
			for(; i > 0; --i, z = f.call(o, z, a[i], i, a));
			return z;	// Object
		},
		// JS 1.8 standard array functions, which can take a lambda as a parameter.
		reduce: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ z){
			// summary: apply a function simultaneously against two values of the array
			//	(from left-to-right) as to reduce it to a single value.
			return arguments.length < 3 ? df.foldl1(a, f) : df.foldl(a, f, z);	// Object
		},
		reduceRight: function(/*Array|String*/ a, /*Function|String|Array*/ f, /*Object?*/ z){
			// summary: apply a function simultaneously against two values of the array
			//	(from right-to-left) as to reduce it to a single value.
			return arguments.length < 3 ? df.foldr1(a, f) : df.foldr(a, f, z);	// Object
		},
		// the fold's counterpart: unfold
		unfold: function(/*Function|String|Array*/ pr, /*Function|String|Array*/ f,
						/*Function|String|Array*/ g, /*Object*/ z, /*Object?*/ o){
			// summary: builds an array by unfolding a value
			o = o || win.global; f = df.lambda(f); g = df.lambda(g); pr = df.lambda(pr);
			var t = [];
			for(; !pr.call(o, z); t.push(f.call(o, z)), z = g.call(o, z));
			return t;	// Array
		}
	});
});

},
'dojox/charting/StoreSeries':function(){
define("dojox/charting/StoreSeries", ["dojo/_base/array", "dojo/_base/declare", "dojo/_base/Deferred"], 
  function(arr, declare, Deferred){
	
	return declare("dojox.charting.StoreSeries", null, {
		constructor: function(store, kwArgs, value){
			//	summary:
			//		Series adapter for dojo object stores (dojo.store).
			//	store: Object:
			//		A dojo object store.
			//	kwArgs: Object:
			//		A store-specific keyword parameters used for querying objects.
			//		See dojo.store docs
			//	value: Function|Object|String|Null:
			//		Function, which takes an object handle, and
			//		produces an output possibly inspecting the store's item. Or
			//		a dictionary object, which tells what names to extract from
			//		an object and how to map them to an output. Or a string, which
			//		is a numeric field name to use for plotting. If undefined, null
			//		or empty string (the default), "value" field is extracted.
			this.store = store;
			this.kwArgs = kwArgs;
	
			if(value){
				if(typeof value == "function"){
					this.value = value;
				}else if(typeof value == "object"){
					this.value = function(object){
						var o = {};
						for(var key in value){
							o[key] = object[value[key]];
						}
						return o;
					};
				}else{
					this.value = function(object){
						return object[value];
					};
				}
			}else{
				this.value = function(object){
					return object.value;
				};
			}
	
			this.data = [];
	
			this.fetch();
		},
	
		destroy: function(){
			//	summary:
			//		Clean up before GC.
			if(this.observeHandle){
				this.observeHandle.cancel();
			}
		},
	
		setSeriesObject: function(series){
			//	summary:
			//		Sets a dojox.charting.Series object we will be working with.
			//	series: dojox.charting.Series:
			//		Our interface to the chart.
			this.series = series;
		},
	
		// store fetch loop
	
		fetch: function(){
			//	summary:
			//		Fetches data from the store and updates a chart.
			var objects = this.objects = [];
			var self = this;
			if(this.observeHandle){
				this.observeHandle.cancel();
			}
			var results = this.store.query(this.kwArgs.query, this.kwArgs);
			Deferred.when(results, function(objects){
				self.objects = objects;
				update();
			});
			if(results.observe){
				this.observeHandle = results.observe(update, true);
			}
			function update(){
				self.data = arr.map(self.objects, function(object){
					return self.value(object, self.store);
				});
				self._pushDataChanges();
			}
		},
	
		_pushDataChanges: function(){
			if(this.series){
				this.series.chart.updateSeries(this.series.name, this);
				this.series.chart.delayedRender();
			}
		}
	
	});
});

},
'dojox/gfx/svg':function(){
define("dojox/gfx/svg", ["dojo/_base/lang", "dojo/_base/window", "dojo/dom","dojo/_base/declare", "dojo/_base/array",
  "dojo/dom-geometry", "dojo/_base/Color", "./_base", "./shape", "./path"],
  function(lang, win, dom, declare, arr, domGeom, Color, g, gs, pathLib){
/*=====
	dojox.gfx.svg = {
	// module:
	//		dojox/gfx/svg
	// summary:
	//		This the graphics rendering bridge for browsers compliant with W3C SVG1.0.
	//		This is the preferred renderer to use for interactive and accessible graphics.
	};
	pathLib.Path = dojox.gfx.path.Path;
	pathLib.TextPath = dojox.gfx.path.TextPath;
	svg.Shape = dojox.gfx.canvas.Shape;
	gs.Shape = dojox.gfx.shape.Shape;
	gs.Rect = dojox.gfx.shape.Rect;
	gs.Ellipse = dojox.gfx.shape.Ellipse;
	gs.Circle = dojox.gfx.shape.Circle;
	gs.Line = dojox.gfx.shape.Line;
	gs.PolyLine = dojox.gfx.shape.PolyLine;
	gs.Image = dojox.gfx.shape.Image;
	gs.Text = dojox.gfx.shape.Text;
	gs.Surface = dojox.gfx.shape.Surface;
  =====*/
  var svg = g.svg = {};
	svg.useSvgWeb = (typeof window.svgweb != "undefined");

	// Need to detect iOS in order to workaround bug when
	// touching nodes with text
	var uagent = navigator.userAgent.toLowerCase(),
		safMobile = uagent.search('iphone') > -1 ||
					uagent.search('ipad') > -1 ||
					uagent.search('ipod') > -1;

	function _createElementNS(ns, nodeType){
		// summary:
		//		Internal helper to deal with creating elements that
		//		are namespaced.  Mainly to get SVG markup output
		//		working on IE.
		if(win.doc.createElementNS){
			return win.doc.createElementNS(ns,nodeType);
		}else{
			return win.doc.createElement(nodeType);
		}
	}

	function _createTextNode(text){
		if(svg.useSvgWeb){
			return win.doc.createTextNode(text, true);
		}else{
			return win.doc.createTextNode(text);
		}
	}

	function _createFragment(){
		if(svg.useSvgWeb){
			return win.doc.createDocumentFragment(true);
		}else{
			return win.doc.createDocumentFragment();
		}
	}

	svg.xmlns = {
		xlink: "http://www.w3.org/1999/xlink",
		svg:   "http://www.w3.org/2000/svg"
	};

	svg.getRef = function(name){
		// summary: returns a DOM Node specified by the name argument or null
		// name: String: an SVG external reference
		if(!name || name == "none") return null;
		if(name.match(/^url\(#.+\)$/)){
			return dom.byId(name.slice(5, -1));	// Node
		}
		// alternative representation of a reference
		if(name.match(/^#dojoUnique\d+$/)){
			// we assume here that a reference was generated by dojox.gfx
			return dom.byId(name.slice(1));	// Node
		}
		return null;	// Node
	};

	svg.dasharray = {
		solid:				"none",
		shortdash:			[4, 1],
		shortdot:			[1, 1],
		shortdashdot:		[4, 1, 1, 1],
		shortdashdotdot:	[4, 1, 1, 1, 1, 1],
		dot:				[1, 3],
		dash:				[4, 3],
		longdash:			[8, 3],
		dashdot:			[4, 3, 1, 3],
		longdashdot:		[8, 3, 1, 3],
		longdashdotdot:		[8, 3, 1, 3, 1, 3]
	};

	declare("dojox.gfx.svg.Shape", gs.Shape, {
		// summary: SVG-specific implementation of dojox.gfx.Shape methods

		setFill: function(fill){
			// summary: sets a fill object (SVG)
			// fill: Object: a fill object
			//	(see dojox.gfx.defaultLinearGradient,
			//	dojox.gfx.defaultRadialGradient,
			//	dojox.gfx.defaultPattern,
			//	or dojo.Color)

			if(!fill){
				// don't fill
				this.fillStyle = null;
				this.rawNode.setAttribute("fill", "none");
				this.rawNode.setAttribute("fill-opacity", 0);
				return this;
			}
			var f;
			// FIXME: slightly magical. We're using the outer scope's "f", but setting it later
			var setter = function(x){
					// we assume that we're executing in the scope of the node to mutate
					this.setAttribute(x, f[x].toFixed(8));
				};
			if(typeof(fill) == "object" && "type" in fill){
				// gradient
				switch(fill.type){
					case "linear":
						f = g.makeParameters(g.defaultLinearGradient, fill);
						var gradient = this._setFillObject(f, "linearGradient");
						arr.forEach(["x1", "y1", "x2", "y2"], setter, gradient);
						break;
					case "radial":
						f = g.makeParameters(g.defaultRadialGradient, fill);
						var grad = this._setFillObject(f, "radialGradient");
						arr.forEach(["cx", "cy", "r"], setter, grad);
						break;
					case "pattern":
						f = g.makeParameters(g.defaultPattern, fill);
						var pattern = this._setFillObject(f, "pattern");
						arr.forEach(["x", "y", "width", "height"], setter, pattern);
						break;
				}
				this.fillStyle = f;
				return this;
			}
			// color object
			f = g.normalizeColor(fill);
			this.fillStyle = f;
			this.rawNode.setAttribute("fill", f.toCss());
			this.rawNode.setAttribute("fill-opacity", f.a);
			this.rawNode.setAttribute("fill-rule", "evenodd");
			return this;	// self
		},

		setStroke: function(stroke){
			//	summary:
			//		sets a stroke object (SVG)
			//	stroke: Object
			// 		a stroke object (see dojox.gfx.defaultStroke)

			var rn = this.rawNode;
			if(!stroke){
				// don't stroke
				this.strokeStyle = null;
				rn.setAttribute("stroke", "none");
				rn.setAttribute("stroke-opacity", 0);
				return this;
			}
			// normalize the stroke
			if(typeof stroke == "string" || lang.isArray(stroke) || stroke instanceof Color){
				stroke = { color: stroke };
			}
			var s = this.strokeStyle = g.makeParameters(g.defaultStroke, stroke);
			s.color = g.normalizeColor(s.color);
			// generate attributes
			if(s){
				rn.setAttribute("stroke", s.color.toCss());
				rn.setAttribute("stroke-opacity", s.color.a);
				rn.setAttribute("stroke-width",   s.width);
				rn.setAttribute("stroke-linecap", s.cap);
				if(typeof s.join == "number"){
					rn.setAttribute("stroke-linejoin",   "miter");
					rn.setAttribute("stroke-miterlimit", s.join);
				}else{
					rn.setAttribute("stroke-linejoin",   s.join);
				}
				var da = s.style.toLowerCase();
				if(da in svg.dasharray){
					da = svg.dasharray[da];
				}
				if(da instanceof Array){
					da = lang._toArray(da);
					for(var i = 0; i < da.length; ++i){
						da[i] *= s.width;
					}
					if(s.cap != "butt"){
						for(var i = 0; i < da.length; i += 2){
							da[i] -= s.width;
							if(da[i] < 1){ da[i] = 1; }
						}
						for(var i = 1; i < da.length; i += 2){
							da[i] += s.width;
						}
					}
					da = da.join(",");
				}
				rn.setAttribute("stroke-dasharray", da);
				rn.setAttribute("dojoGfxStrokeStyle", s.style);
			}
			return this;	// self
		},

		_getParentSurface: function(){
			var surface = this.parent;
			for(; surface && !(surface instanceof g.Surface); surface = surface.parent);
			return surface;
		},

		_setFillObject: function(f, nodeType){
			var svgns = svg.xmlns.svg;
			this.fillStyle = f;
			var surface = this._getParentSurface(),
				defs = surface.defNode,
				fill = this.rawNode.getAttribute("fill"),
				ref  = svg.getRef(fill);
			if(ref){
				fill = ref;
				if(fill.tagName.toLowerCase() != nodeType.toLowerCase()){
					var id = fill.id;
					fill.parentNode.removeChild(fill);
					fill = _createElementNS(svgns, nodeType);
					fill.setAttribute("id", id);
					defs.appendChild(fill);
				}else{
					while(fill.childNodes.length){
						fill.removeChild(fill.lastChild);
					}
				}
			}else{
				fill = _createElementNS(svgns, nodeType);
				fill.setAttribute("id", g._base._getUniqueId());
				defs.appendChild(fill);
			}
			if(nodeType == "pattern"){
				fill.setAttribute("patternUnits", "userSpaceOnUse");
				var img = _createElementNS(svgns, "image");
				img.setAttribute("x", 0);
				img.setAttribute("y", 0);
				img.setAttribute("width",  f.width .toFixed(8));
				img.setAttribute("height", f.height.toFixed(8));
				img.setAttributeNS(svg.xmlns.xlink, "xlink:href", f.src);
				fill.appendChild(img);
			}else{
				fill.setAttribute("gradientUnits", "userSpaceOnUse");
				for(var i = 0; i < f.colors.length; ++i){
					var c = f.colors[i], t = _createElementNS(svgns, "stop"),
						cc = c.color = g.normalizeColor(c.color);
					t.setAttribute("offset",       c.offset.toFixed(8));
					t.setAttribute("stop-color",   cc.toCss());
					t.setAttribute("stop-opacity", cc.a);
					fill.appendChild(t);
				}
			}
			this.rawNode.setAttribute("fill", "url(#" + fill.getAttribute("id") +")");
			this.rawNode.removeAttribute("fill-opacity");
			this.rawNode.setAttribute("fill-rule", "evenodd");
			return fill;
		},

		_applyTransform: function() {
			var matrix = this.matrix;
			if(matrix){
				var tm = this.matrix;
				this.rawNode.setAttribute("transform", "matrix(" +
					tm.xx.toFixed(8) + "," + tm.yx.toFixed(8) + "," +
					tm.xy.toFixed(8) + "," + tm.yy.toFixed(8) + "," +
					tm.dx.toFixed(8) + "," + tm.dy.toFixed(8) + ")");
			}else{
				this.rawNode.removeAttribute("transform");
			}
			return this;
		},

		setRawNode: function(rawNode){
			// summary:
			//	assigns and clears the underlying node that will represent this
			//	shape. Once set, transforms, gradients, etc, can be applied.
			//	(no fill & stroke by default)
			var r = this.rawNode = rawNode;
			if(this.shape.type!="image"){
				r.setAttribute("fill", "none");
			}
			r.setAttribute("fill-opacity", 0);
			r.setAttribute("stroke", "none");
			r.setAttribute("stroke-opacity", 0);
			r.setAttribute("stroke-width", 1);
			r.setAttribute("stroke-linecap", "butt");
			r.setAttribute("stroke-linejoin", "miter");
			r.setAttribute("stroke-miterlimit", 4);
			// Bind GFX object with SVG node for ease of retrieval - that is to
			// save code/performance to keep this association elsewhere
			r.__gfxObject__ = this.getUID();
		},

		setShape: function(newShape){
			// summary: sets a shape object (SVG)
			// newShape: Object: a shape object
			//	(see dojox.gfx.defaultPath,
			//	dojox.gfx.defaultPolyline,
			//	dojox.gfx.defaultRect,
			//	dojox.gfx.defaultEllipse,
			//	dojox.gfx.defaultCircle,
			//	dojox.gfx.defaultLine,
			//	or dojox.gfx.defaultImage)
			this.shape = g.makeParameters(this.shape, newShape);
			for(var i in this.shape){
				if(i != "type"){
					this.rawNode.setAttribute(i, this.shape[i]);
				}
			}
			this.bbox = null;
			return this;	// self
		},

		// move family

		_moveToFront: function(){
			// summary: moves a shape to front of its parent's list of shapes (SVG)
			this.rawNode.parentNode.appendChild(this.rawNode);
			return this;	// self
		},
		_moveToBack: function(){
			// summary: moves a shape to back of its parent's list of shapes (SVG)
			this.rawNode.parentNode.insertBefore(this.rawNode, this.rawNode.parentNode.firstChild);
			return this;	// self
		}
	});

	declare("dojox.gfx.svg.Group", svg.Shape, {
		// summary: a group shape (SVG), which can be used
		//	to logically group shapes (e.g, to propagate matricies)
		constructor: function(){
			gs.Container._init.call(this);
		},
		setRawNode: function(rawNode){
			// summary: sets a raw SVG node to be used by this shape
			// rawNode: Node: an SVG node
			this.rawNode = rawNode;
			// Bind GFX object with SVG node for ease of retrieval - that is to
			// save code/performance to keep this association elsewhere
			this.rawNode.__gfxObject__ = this.getUID();
		}
	});
	svg.Group.nodeType = "g";

	declare("dojox.gfx.svg.Rect", [svg.Shape, gs.Rect], {
		// summary: a rectangle shape (SVG)
		setShape: function(newShape){
			// summary: sets a rectangle shape object (SVG)
			// newShape: Object: a rectangle shape object
			this.shape = g.makeParameters(this.shape, newShape);
			this.bbox = null;
			for(var i in this.shape){
				if(i != "type" && i != "r"){
					this.rawNode.setAttribute(i, this.shape[i]);
				}
			}
			if(this.shape.r != null){
				this.rawNode.setAttribute("ry", this.shape.r);
				this.rawNode.setAttribute("rx", this.shape.r);
			}
			return this;	// self
		}
	});
	svg.Rect.nodeType = "rect";

	declare("dojox.gfx.svg.Ellipse", [svg.Shape, gs.Ellipse], {});
	svg.Ellipse.nodeType = "ellipse";

	declare("dojox.gfx.svg.Circle", [svg.Shape, gs.Circle], {});
	svg.Circle.nodeType = "circle";

	declare("dojox.gfx.svg.Line", [svg.Shape, gs.Line], {});
	svg.Line.nodeType = "line";

	declare("dojox.gfx.svg.Polyline", [svg.Shape, gs.Polyline], {
		// summary: a polyline/polygon shape (SVG)
		setShape: function(points, closed){
			// summary: sets a polyline/polygon shape object (SVG)
			// points: Object: a polyline/polygon shape object
			if(points && points instanceof Array){
				// branch
				// points: Array: an array of points
				this.shape = g.makeParameters(this.shape, { points: points });
				if(closed && this.shape.points.length){
					this.shape.points.push(this.shape.points[0]);
				}
			}else{
				this.shape = g.makeParameters(this.shape, points);
			}
			this.bbox = null;
			this._normalizePoints();
			var attr = [], p = this.shape.points;
			for(var i = 0; i < p.length; ++i){
				attr.push(p[i].x.toFixed(8), p[i].y.toFixed(8));
			}
			this.rawNode.setAttribute("points", attr.join(" "));
			return this;	// self
		}
	});
	svg.Polyline.nodeType = "polyline";

	declare("dojox.gfx.svg.Image", [svg.Shape, gs.Image], {
		// summary: an image (SVG)
		setShape: function(newShape){
			// summary: sets an image shape object (SVG)
			// newShape: Object: an image shape object
			this.shape = g.makeParameters(this.shape, newShape);
			this.bbox = null;
			var rawNode = this.rawNode;
			for(var i in this.shape){
				if(i != "type" && i != "src"){
					rawNode.setAttribute(i, this.shape[i]);
				}
			}
			rawNode.setAttribute("preserveAspectRatio", "none");
			rawNode.setAttributeNS(svg.xmlns.xlink, "xlink:href", this.shape.src);
			// Bind GFX object with SVG node for ease of retrieval - that is to
			// save code/performance to keep this association elsewhere
			rawNode.__gfxObject__ = this.getUID();
			return this;	// self
		}
	});
	svg.Image.nodeType = "image";

	declare("dojox.gfx.svg.Text", [svg.Shape, gs.Text], {
		// summary: an anchored text (SVG)
		setShape: function(newShape){
			// summary: sets a text shape object (SVG)
			// newShape: Object: a text shape object
			this.shape = g.makeParameters(this.shape, newShape);
			this.bbox = null;
			var r = this.rawNode, s = this.shape;
			r.setAttribute("x", s.x);
			r.setAttribute("y", s.y);
			r.setAttribute("text-anchor", s.align);
			r.setAttribute("text-decoration", s.decoration);
			r.setAttribute("rotate", s.rotated ? 90 : 0);
			r.setAttribute("kerning", s.kerning ? "auto" : 0);
			r.setAttribute("text-rendering", "optimizeLegibility");

			// update the text content
			if(r.firstChild){
				r.firstChild.nodeValue = s.text;
			}else{
				r.appendChild(_createTextNode(s.text));
			}
			return this;	// self
		},
		getTextWidth: function(){
			// summary: get the text width in pixels
			var rawNode = this.rawNode,
				oldParent = rawNode.parentNode,
				_measurementNode = rawNode.cloneNode(true);
			_measurementNode.style.visibility = "hidden";

			// solution to the "orphan issue" in FF
			var _width = 0, _text = _measurementNode.firstChild.nodeValue;
			oldParent.appendChild(_measurementNode);

			// solution to the "orphan issue" in Opera
			// (nodeValue == "" hangs firefox)
			if(_text!=""){
				while(!_width){
//Yang: work around svgweb bug 417 -- http://code.google.com/p/svgweb/issues/detail?id=417
if (_measurementNode.getBBox)
					_width = parseInt(_measurementNode.getBBox().width);
else
	_width = 68;
				}
			}
			oldParent.removeChild(_measurementNode);
			return _width;
		}
	});
	svg.Text.nodeType = "text";

	declare("dojox.gfx.svg.Path", [svg.Shape, pathLib.Path], {
		// summary: a path shape (SVG)
		_updateWithSegment: function(segment){
			// summary: updates the bounding box of path with new segment
			// segment: Object: a segment
			this.inherited(arguments);
			if(typeof(this.shape.path) == "string"){
				this.rawNode.setAttribute("d", this.shape.path);
			}
		},
		setShape: function(newShape){
			// summary: forms a path using a shape (SVG)
			// newShape: Object: an SVG path string or a path object (see dojox.gfx.defaultPath)
			this.inherited(arguments);
			if(this.shape.path){
				this.rawNode.setAttribute("d", this.shape.path);
			}else{
				this.rawNode.removeAttribute("d");
			}
			return this;	// self
		}
	});
	svg.Path.nodeType = "path";

	declare("dojox.gfx.svg.TextPath", [svg.Shape, pathLib.TextPath], {
		// summary: a textpath shape (SVG)
		_updateWithSegment: function(segment){
			// summary: updates the bounding box of path with new segment
			// segment: Object: a segment
			this.inherited(arguments);
			this._setTextPath();
		},
		setShape: function(newShape){
			// summary: forms a path using a shape (SVG)
			// newShape: Object: an SVG path string or a path object (see dojox.gfx.defaultPath)
			this.inherited(arguments);
			this._setTextPath();
			return this;	// self
		},
		_setTextPath: function(){
			if(typeof this.shape.path != "string"){ return; }
			var r = this.rawNode;
			if(!r.firstChild){
				var tp = _createElementNS(svg.xmlns.svg, "textPath"),
					tx = _createTextNode("");
				tp.appendChild(tx);
				r.appendChild(tp);
			}
			var ref  = r.firstChild.getAttributeNS(svg.xmlns.xlink, "href"),
				path = ref && svg.getRef(ref);
			if(!path){
				var surface = this._getParentSurface();
				if(surface){
					var defs = surface.defNode;
					path = _createElementNS(svg.xmlns.svg, "path");
					var id = g._base._getUniqueId();
					path.setAttribute("id", id);
					defs.appendChild(path);
					r.firstChild.setAttributeNS(svg.xmlns.xlink, "xlink:href", "#" + id);
				}
			}
			if(path){
				path.setAttribute("d", this.shape.path);
			}
		},
		_setText: function(){
			var r = this.rawNode;
			if(!r.firstChild){
				var tp = _createElementNS(svg.xmlns.svg, "textPath"),
					tx = _createTextNode("");
				tp.appendChild(tx);
				r.appendChild(tp);
			}
			r = r.firstChild;
			var t = this.text;
			r.setAttribute("alignment-baseline", "middle");
			switch(t.align){
				case "middle":
					r.setAttribute("text-anchor", "middle");
					r.setAttribute("startOffset", "50%");
					break;
				case "end":
					r.setAttribute("text-anchor", "end");
					r.setAttribute("startOffset", "100%");
					break;
				default:
					r.setAttribute("text-anchor", "start");
					r.setAttribute("startOffset", "0%");
					break;
			}
			//r.parentNode.setAttribute("alignment-baseline", "central");
			//r.setAttribute("dominant-baseline", "central");
			r.setAttribute("baseline-shift", "0.5ex");
			r.setAttribute("text-decoration", t.decoration);
			r.setAttribute("rotate", t.rotated ? 90 : 0);
			r.setAttribute("kerning", t.kerning ? "auto" : 0);
			r.firstChild.data = t.text;
		}
	});
	svg.TextPath.nodeType = "text";

	declare("dojox.gfx.svg.Surface", gs.Surface, {
		// summary: a surface object to be used for drawings (SVG)
		constructor: function(){
			gs.Container._init.call(this);
		},
		destroy: function(){
			this.defNode = null;	// release the external reference
			this.inherited(arguments);
		},
		setDimensions: function(width, height){
			// summary: sets the width and height of the rawNode
			// width: String: width of surface, e.g., "100px"
			// height: String: height of surface, e.g., "100px"
			if(!this.rawNode){ return this; }
			this.rawNode.setAttribute("width",  width);
			this.rawNode.setAttribute("height", height);
			return this;	// self
		},
		getDimensions: function(){
			// summary: returns an object with properties "width" and "height"
			var t = this.rawNode ? {
				width:  g.normalizedLength(this.rawNode.getAttribute("width")),
				height: g.normalizedLength(this.rawNode.getAttribute("height"))} : null;
			return t;	// Object
		}
	});

	svg.createSurface = function(parentNode, width, height){
		// summary: creates a surface (SVG)
		// parentNode: Node: a parent node
		// width: String: width of surface, e.g., "100px"
		// height: String: height of surface, e.g., "100px"

		var s = new svg.Surface();
		s.rawNode = _createElementNS(svg.xmlns.svg, "svg");
		s.rawNode.setAttribute("overflow", "hidden");
		if(width){
			s.rawNode.setAttribute("width",  width);
		}
		if(height){
			s.rawNode.setAttribute("height", height);
		}

		var defNode = _createElementNS(svg.xmlns.svg, "defs");
		s.rawNode.appendChild(defNode);
		s.defNode = defNode;

		s._parent = dom.byId(parentNode);
		s._parent.appendChild(s.rawNode);

		return s;	// dojox.gfx.Surface
	};

	// Extenders

	var Font = {
		_setFont: function(){
			// summary: sets a font object (SVG)
			var f = this.fontStyle;
			// next line doesn't work in Firefox 2 or Opera 9
			//this.rawNode.setAttribute("font", dojox.gfx.makeFontString(this.fontStyle));
			this.rawNode.setAttribute("font-style", f.style);
			this.rawNode.setAttribute("font-variant", f.variant);
			this.rawNode.setAttribute("font-weight", f.weight);
			this.rawNode.setAttribute("font-size", f.size);
			this.rawNode.setAttribute("font-family", f.family);
		}
	};

	var C = gs.Container, Container = {
		openBatch: function() {
			// summary: starts a new batch, subsequent new child shapes will be held in
			//	the batch instead of appending to the container directly
			this.fragment = _createFragment();
		},
		closeBatch: function() {
			// summary: submits the current batch, append all pending child shapes to DOM
			if (this.fragment) {
				this.rawNode.appendChild(this.fragment);
				delete this.fragment;
			}
		},
		add: function(shape){
			// summary: adds a shape to a group/surface
			// shape: dojox.gfx.Shape: an VML shape object
			if(this != shape.getParent()){
				if (this.fragment) {
					this.fragment.appendChild(shape.rawNode);
				} else {
					this.rawNode.appendChild(shape.rawNode);
				}
				C.add.apply(this, arguments);
			}
			return this;	// self
		},
		remove: function(shape, silently){
			// summary: remove a shape from a group/surface
			// shape: dojox.gfx.Shape: an VML shape object
			// silently: Boolean?: if true, regenerate a picture
			if(this == shape.getParent()){
				if(this.rawNode == shape.rawNode.parentNode){
					this.rawNode.removeChild(shape.rawNode);
				}
				if(this.fragment && this.fragment == shape.rawNode.parentNode){
					this.fragment.removeChild(shape.rawNode);
				}
				C.remove.apply(this, arguments);
			}
			return this;	// self
		},
		clear: function(){
			// summary: removes all shapes from a group/surface
			var r = this.rawNode;
			while(r.lastChild){
				r.removeChild(r.lastChild);
			}
			var defNode = this.defNode;
			if(defNode){
				while(defNode.lastChild){
					defNode.removeChild(defNode.lastChild);
				}
				r.appendChild(defNode);
			}
			return C.clear.apply(this, arguments);
		},
		_moveChildToFront: C._moveChildToFront,
		_moveChildToBack:  C._moveChildToBack
	};

	var Creator = {
		// summary: SVG shape creators
		createObject: function(shapeType, rawShape){
			// summary: creates an instance of the passed shapeType class
			// shapeType: Function: a class constructor to create an instance of
			// rawShape: Object: properties to be passed in to the classes "setShape" method
			if(!this.rawNode){ return null; }
			var shape = new shapeType(),
				node = _createElementNS(svg.xmlns.svg, shapeType.nodeType);

			shape.setRawNode(node);
			shape.setShape(rawShape);
			// rawNode.appendChild() will be done inside this.add(shape) below
			this.add(shape);
			return shape;	// dojox.gfx.Shape
		}
	};

	lang.extend(svg.Text, Font);
	lang.extend(svg.TextPath, Font);

	lang.extend(svg.Group, Container);
	lang.extend(svg.Group, gs.Creator);
	lang.extend(svg.Group, Creator);

	lang.extend(svg.Surface, Container);
	lang.extend(svg.Surface, gs.Creator);
	lang.extend(svg.Surface, Creator);

	// Mouse/Touch event
	svg.fixTarget = function(event, gfxElement) {
		// summary:
		//     Adds the gfxElement to event.gfxTarget if none exists. This new
		//     property will carry the GFX element associated with this event.
		// event: Object
		//     The current input event (MouseEvent or TouchEvent)
		// gfxElement: Object
		//     The GFX target element
		if (!event.gfxTarget) {
			if (safMobile && event.target.wholeText) {
				// Workaround iOS bug when touching text nodes
				event.gfxTarget = gs.byId(event.target.parentElement.__gfxObject__);
			} else {
				event.gfxTarget = gs.byId(event.target.__gfxObject__);
			}
		}
		return true;
	};

	// some specific override for svgweb + flash
	if(svg.useSvgWeb){
		// override createSurface()
		svg.createSurface = function(parentNode, width, height){
			var s = new svg.Surface();

			// ensure width / height
			if(!width || !height){
				var pos = domGeom.position(parentNode);
				width  = width  || pos.w;
				height = height || pos.h;
			}

			// ensure id
			parentNode = dom.byId(parentNode);
			var id = parentNode.id ? parentNode.id+'_svgweb' : g._base._getUniqueId();

			// create dynamic svg root
			var mockSvg = _createElementNS(svg.xmlns.svg, 'svg');
			mockSvg.id = id;
			mockSvg.setAttribute('width', width);
			mockSvg.setAttribute('height', height);
			svgweb.appendChild(mockSvg, parentNode);

			// notice: any call to the raw node before flash init will fail.
			mockSvg.addEventListener('SVGLoad', function(){
				// become loaded
				s.rawNode = this;
				s.isLoaded = true;

				// init defs
				var defNode = _createElementNS(svg.xmlns.svg, "defs");
				s.rawNode.appendChild(defNode);
				s.defNode = defNode;

				// notify application
				if (s.onLoad)
					s.onLoad(s);
			}, false);

			// flash not loaded yet
			s.isLoaded = false;
			return s;
		};

		// override Surface.destroy()
		svg.Surface.extend({
			destroy: function(){
				var mockSvg = this.rawNode;
				svgweb.removeChild(mockSvg, mockSvg.parentNode);
			}
		});

		// override connect() & disconnect() for Shape & Surface event processing
		var _eventsProcessing = {
			connect: function(name, object, method){
				// connect events using the mock addEventListener() provided by svgweb
				if (name.substring(0, 2)==='on') { name = name.substring(2); }
				if (arguments.length == 2) {
					method = object;
				} else {
					method = lang.hitch(object, method);
				}
				this.getEventSource().addEventListener(name, method, false);
				return [this, name, method];
			},
			disconnect: function(token){
				// disconnect events using the mock removeEventListener() provided by svgweb
				this.getEventSource().removeEventListener(token[1], token[2], false);
				delete token[0];
			}
		};

		lang.extend(svg.Shape, _eventsProcessing);
		lang.extend(svg.Surface, _eventsProcessing);
	}

	return svg;
});

},
'dojo/regexp':function(){
define(["./_base/kernel", "./_base/lang"], function(dojo, lang) {
	// module:
	//		dojo/regexp
	// summary:
	//		TODOC

lang.getObject("regexp", true, dojo);

/*=====
dojo.regexp = {
	// summary: Regular expressions and Builder resources
};
=====*/

dojo.regexp.escapeString = function(/*String*/str, /*String?*/except){
	//	summary:
	//		Adds escape sequences for special characters in regular expressions
	// except:
	//		a String with special characters to be left unescaped

	return str.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, function(ch){
		if(except && except.indexOf(ch) != -1){
			return ch;
		}
		return "\\" + ch;
	}); // String
};

dojo.regexp.buildGroupRE = function(/*Object|Array*/arr, /*Function*/re, /*Boolean?*/nonCapture){
	//	summary:
	//		Builds a regular expression that groups subexpressions
	//	description:
	//		A utility function used by some of the RE generators. The
	//		subexpressions are constructed by the function, re, in the second
	//		parameter.  re builds one subexpression for each elem in the array
	//		a, in the first parameter. Returns a string for a regular
	//		expression that groups all the subexpressions.
	// arr:
	//		A single value or an array of values.
	// re:
	//		A function. Takes one parameter and converts it to a regular
	//		expression.
	// nonCapture:
	//		If true, uses non-capturing match, otherwise matches are retained
	//		by regular expression. Defaults to false

	// case 1: a is a single value.
	if(!(arr instanceof Array)){
		return re(arr); // String
	}

	// case 2: a is an array
	var b = [];
	for(var i = 0; i < arr.length; i++){
		// convert each elem to a RE
		b.push(re(arr[i]));
	}

	 // join the REs as alternatives in a RE group.
	return dojo.regexp.group(b.join("|"), nonCapture); // String
};

dojo.regexp.group = function(/*String*/expression, /*Boolean?*/nonCapture){
	// summary:
	//		adds group match to expression
	// nonCapture:
	//		If true, uses non-capturing match, otherwise matches are retained
	//		by regular expression.
	return "(" + (nonCapture ? "?:":"") + expression + ")"; // String
};

return dojo.regexp;
});

},
'dojo/_base/NodeList':function(){
define(["./kernel", "../query", "./array", "./html", "../NodeList-dom"], function(dojo, query, array){
  //  module:
  //    dojo/_base/NodeList
  //  summary:
  //    This module defines dojo.NodeList.
 
var NodeList = query.NodeList;

	/*=====
	dojo.extend(dojo.NodeList, {
		connect: function(methodName, objOrFunc, funcName){
			// summary:
			//		attach event handlers to every item of the NodeList. Uses dojo.connect()
			//		so event properties are normalized
			// methodName: String
			//		the name of the method to attach to. For DOM events, this should be
			//		the lower-case name of the event
			// objOrFunc: Object|Function|String
			//		if 2 arguments are passed (methodName, objOrFunc), objOrFunc should
			//		reference a function or be the name of the function in the global
			//		namespace to attach. If 3 arguments are provided
			//		(methodName, objOrFunc, funcName), objOrFunc must be the scope to
			//		locate the bound function in
			// funcName: String?
			//		optional. A string naming the function in objOrFunc to bind to the
			//		event. May also be a function reference.
			// example:
			//		add an onclick handler to every button on the page
			//		|	dojo.query("div:nth-child(odd)").connect("onclick", function(e){
			//		|		console.log("clicked!");
			//		|	});
			// example:
			//		attach foo.bar() to every odd div's onmouseover
			//		|	dojo.query("div:nth-child(odd)").connect("onmouseover", foo, "bar");
		},
		coords: function(){
			// summary:
			//		Deprecated: Use position() for border-box x/y/w/h
			//		or marginBox() for margin-box w/h/l/t.
			//		Returns the box objects of all elements in a node list as
			//		an Array (*not* a NodeList). Acts like `dojo.coords`, though assumes
			//		the node passed is each node in this list.

			return dojo.map(this, dojo.coords); // Array
		}
	 });

	 var NodeList = dojo.NodeList;
	=====*/
	var nlp = NodeList.prototype;

	// don't bind early to dojo.connect since we no longer explicitly depend on it
	nlp.connect = NodeList._adaptAsForEach(function(){
		return dojo.connect.apply(this, arguments);
	});
	nlp.coords = NodeList._adaptAsMap(dojo.coords);

	NodeList.events = [
		// summary:
		//		list of all DOM events used in NodeList
		"blur", "focus", "change", "click", "error", "keydown", "keypress",
		"keyup", "load", "mousedown", "mouseenter", "mouseleave", "mousemove",
		"mouseout", "mouseover", "mouseup", "submit"
	];

	// FIXME: pseudo-doc the above automatically generated on-event functions

	// syntactic sugar for DOM events
	array.forEach(NodeList.events, function(evt){
			var _oe = "on" + evt;
			nlp[_oe] = function(a, b){
				return this.connect(_oe, a, b);
			};
				// FIXME: should these events trigger publishes?
				/*
				return (a ? this.connect(_oe, a, b) :
							this.forEach(function(n){
								// FIXME:
								//		listeners get buried by
								//		addEventListener and can't be dug back
								//		out to be triggered externally.
								// see:
								//		http://developer.mozilla.org/en/docs/DOM:element

								console.log(n, evt, _oe);

								// FIXME: need synthetic event support!
								var _e = { target: n, faux: true, type: evt };
								// dojo._event_listener._synthesizeEvent({}, { target: n, faux: true, type: evt });
								try{ n[evt](_e); }catch(e){ console.log(e); }
								try{ n[_oe](_e); }catch(e){ console.log(e); }
							})
				);
				*/
		}
	);

	dojo.NodeList = NodeList;
	return dojo.NodeList;
});

},
'dojox/lang/functional/array':function(){
define("dojox/lang/functional/array", ["dojo/_base/kernel", "dojo/_base/lang", "dojo/_base/array", "dojo/_base/window", "./lambda"], 
	function(dojo, lang, arr, win, df){

// This module adds high-level functions and related constructs:
//	- array-processing functions similar to standard JS functions

// Notes:
//	- this module provides JS standard methods similar to high-level functions in dojo/_base/array.js:
//		forEach, map, filter, every, some

// Defined methods:
//	- take any valid lambda argument as the functional argument
//	- operate on dense arrays
//	- take a string as the array argument
//	- take an iterator objects as the array argument

	var empty = {};

/*=====
	var df = dojox.lang.functional;
 =====*/
	lang.mixin(df, {
		// JS 1.6 standard array functions, which can take a lambda as a parameter.
		// Consider using dojo._base.array functions, if you don't need the lambda support.
		filter: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates a new array with all elements that pass the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var t = [], v, i, n;
			if(lang.isArray(a)){
				// array
				for(i = 0, n = a.length; i < n; ++i){
					v = a[i];
					if(f.call(o, v, i, a)){ t.push(v); }
				}
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				for(i = 0; a.hasNext();){
					v = a.next();
					if(f.call(o, v, i++, a)){ t.push(v); }
				}
			}else{
				// object/dictionary
				for(i in a){
					if(!(i in empty)){
						v = a[i];
						if(f.call(o, v, i, a)){ t.push(v); }
					}
				}
			}
			return t;	// Array
		},
		forEach: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: executes a provided function once per array element.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var i, n;
			if(lang.isArray(a)){
				// array
				for(i = 0, n = a.length; i < n; f.call(o, a[i], i, a), ++i);
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				for(i = 0; a.hasNext(); f.call(o, a.next(), i++, a));
			}else{
				// object/dictionary
				for(i in a){
					if(!(i in empty)){
						f.call(o, a[i], i, a);
					}
				}
			}
			return o;	// Object
		},
		map: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates a new array with the results of calling
			//	a provided function on every element in this array.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var t, n, i;
			if(lang.isArray(a)){
				// array
				t = new Array(n = a.length);
				for(i = 0; i < n; t[i] = f.call(o, a[i], i, a), ++i);
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				t = [];
				for(i = 0; a.hasNext(); t.push(f.call(o, a.next(), i++, a)));
			}else{
				// object/dictionary
				t = [];
				for(i in a){
					if(!(i in empty)){
						t.push(f.call(o, a[i], i, a));
					}
				}
			}
			return t;	// Array
		},
		every: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: tests whether all elements in the array pass the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var i, n;
			if(lang.isArray(a)){
				// array
				for(i = 0, n = a.length; i < n; ++i){
					if(!f.call(o, a[i], i, a)){
						return false;	// Boolean
					}
				}
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				for(i = 0; a.hasNext();){
					if(!f.call(o, a.next(), i++, a)){
						return false;	// Boolean
					}
				}
			}else{
				// object/dictionary
				for(i in a){
					if(!(i in empty)){
						if(!f.call(o, a[i], i, a)){
							return false;	// Boolean
						}
					}
				}
			}
			return true;	// Boolean
		},
		some: function(/*Array|String|Object*/ a, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: tests whether some element in the array passes the test
			//	implemented by the provided function.
			if(typeof a == "string"){ a = a.split(""); }
			o = o || win.global; f = df.lambda(f);
			var i, n;
			if(lang.isArray(a)){
				// array
				for(i = 0, n = a.length; i < n; ++i){
					if(f.call(o, a[i], i, a)){
						return true;	// Boolean
					}
				}
			}else if(typeof a.hasNext == "function" && typeof a.next == "function"){
				// iterator
				for(i = 0; a.hasNext();){
					if(f.call(o, a.next(), i++, a)){
						return true;	// Boolean
					}
				}
			}else{
				// object/dictionary
				for(i in a){
					if(!(i in empty)){
						if(f.call(o, a[i], i, a)){
							return true;	// Boolean
						}
					}
				}
			}
			return false;	// Boolean
		}
	});
	
	return df;
});

},
'dojo/_base/kernel':function(){
define(["../has", "./config", "require", "module"], function(has, config, require, module){
	// module:
	//		dojo/_base/kernel
	// summary:
	//		This module is the foundational module of the dojo boot sequence; it defines the dojo object.
	var
		// loop variables for this module
		i, p,

		// create dojo, dijit, and dojox
		// FIXME: in 2.0 remove dijit, dojox being created by dojo
		dijit = {},
		dojox = {},
		dojo = {
			// notice dojo takes ownership of the value of the config module
			config:config,
			global:this,
			dijit:dijit,
			dojox:dojox
		};


	// Configure the scope map. For a 100% AMD application, the scope map is not needed other than to provide
	// a _scopeName property for the dojo, dijit, and dojox root object so those packages can create
	// unique names in the global space.
	//
	// Built, legacy modules use the scope map to allow those modules to be expressed as if dojo, dijit, and dojox,
	// where global when in fact they are either global under different names or not global at all. In v1.6-, the
	// config variable "scopeMap" was used to map names as used within a module to global names. This has been
	// subsumed by the dojo packageMap configuration variable which relocates packages to different names. See
	// http://livedocs.dojotoolkit.org/developer/design/loader#legacy-cross-domain-mode for details.
	//
	// The following computations contort the packageMap for this dojo instance into a scopeMap.
	var scopeMap =
			// a map from a name used in a legacy module to the (global variable name, object addressed by that name)
			// always map dojo, dijit, and dojox
			{
				dojo:["dojo", dojo],
				dijit:["dijit", dijit],
				dojox:["dojox", dojox]
			},

		packageMap =
			// the package map for this dojo instance; note, a foreign loader or no pacakgeMap results in the above default config
			(require.packs && require.packs[module.id.match(/[^\/]+/)[0]].packageMap) || {},

		item;

	// process all mapped top-level names for this instance of dojo
	for(p in packageMap){
		if(scopeMap[p]){
			// mapped dojo, dijit, or dojox
			scopeMap[p][0] = packageMap[p];
		}else{
			// some other top-level name
			scopeMap[p] = [packageMap[p], {}];
		}
	}

	// publish those names to _scopeName and, optionally, the global namespace
	for(p in scopeMap){
		item = scopeMap[p];
		item[1]._scopeName = item[0];
		if(!config.noGlobals){
			this[item[0]] = item[1];
		}
	}
	dojo.scopeMap = scopeMap;

	// FIXME: dojo.baseUrl and dojo.config.baseUrl should be deprecated
	dojo.baseUrl = dojo.config.baseUrl = require.baseUrl;
	dojo.isAsync = !1 || require.async;
	dojo.locale = config.locale;

	/*=====
		dojo.version = function(){
			// summary:
			//		Version number of the Dojo Toolkit
			// major: Integer
			//		Major version. If total version is "1.2.0beta1", will be 1
			// minor: Integer
			//		Minor version. If total version is "1.2.0beta1", will be 2
			// patch: Integer
			//		Patch version. If total version is "1.2.0beta1", will be 0
			// flag: String
			//		Descriptor flag. If total version is "1.2.0beta1", will be "beta1"
			// revision: Number
			//		The SVN rev from which dojo was pulled
			this.major = 0;
			this.minor = 0;
			this.patch = 0;
			this.flag = "";
			this.revision = 0;
		}
	=====*/
	var rev = "$Rev: 28982 $".match(/\d+/);
	dojo.version = {
		major: 1, minor: 7, patch: 3, flag: "",
		revision: rev ? +rev[0] : NaN,
		toString: function(){
			var v = dojo.version;
			return v.major + "." + v.minor + "." + v.patch + v.flag + " (" + v.revision + ")";	// String
		}
	};


	// If 1 is truthy, then as a dojo module is defined it should push it's definitions
	// into the dojo object, and conversely. In 2.0, it will likely be unusual to augment another object
	// as a result of defining a module. This has feature gives a way to force 2.0 behavior as the code
	// is migrated. Absent specific advice otherwise, set extend-dojo to truthy.
	true || has.add("extend-dojo", 1);


	dojo.eval = function(scriptText){
		//	summary:
		//		A legacy method created for use exclusively by internal Dojo methods. Do not use this method
		//		directly unless you understand its possibly-different implications on the platforms your are targeting.
		//	description:
		//		Makes an attempt to evaluate scriptText in the global scope. The function works correctly for browsers
		//		that support indirect eval.
		//
		//		As usual, IE does not. On IE, the only way to implement global eval is to
		//		use execScript. Unfortunately, execScript does not return a value and breaks some current usages of dojo.eval.
		//		This implementation uses the technique of executing eval in the scope of a function that is a single scope
		//		frame below the global scope; thereby coming close to the global scope. Note carefully that
		//
		//		dojo.eval("var pi = 3.14;");
		//
		//		will define global pi in non-IE environments, but define pi only in a temporary local scope for IE. If you want
		//		to define a global variable using dojo.eval, write something like
		//
		//		dojo.eval("window.pi = 3.14;")
		//	scriptText:
		//		The text to evaluation.
		//	returns:
		//		The result of the evaluation. Often `undefined`
	};

	(Function("d", "d.eval = function(){return d.global.eval ? d.global.eval(arguments[0]) : eval(arguments[0]);}"))(dojo);


	if(0){
		dojo.exit = function(exitcode){
			quit(exitcode);
		};
	} else{
		dojo.exit = function(){
		};
	}

	true || has.add("dojo-guarantee-console",
		// ensure that console.log, console.warn, etc. are defined
		1
	);
	if(1){
		typeof console != "undefined" || (console = {});
		//	Be careful to leave 'log' always at the end
		var cn = [
			"assert", "count", "debug", "dir", "dirxml", "error", "group",
			"groupEnd", "info", "profile", "profileEnd", "time", "timeEnd",
			"trace", "warn", "log"
		];
		var tn;
		i = 0;
		while((tn = cn[i++])){
			if(!console[tn]){
				(function(){
					var tcn = tn + "";
					console[tcn] = ('log' in console) ? function(){
						var a = Array.apply({}, arguments);
						a.unshift(tcn + ":");
						console["log"](a.join(" "));
					} : function(){};
					console[tcn]._fake = true;
				})();
			}
		}
	}

	has.add("dojo-debug-messages",
		// include dojo.deprecated/dojo.experimental implementations
		!!config.isDebug
	);
	if(has("dojo-debug-messages")){
		dojo.deprecated = function(/*String*/ behaviour, /*String?*/ extra, /*String?*/ removal){
			//	summary:
			//		Log a debug message to indicate that a behavior has been
			//		deprecated.
			//	behaviour: String
			//		The API or behavior being deprecated. Usually in the form
			//		of "myApp.someFunction()".
			//	extra: String?
			//		Text to append to the message. Often provides advice on a
			//		new function or facility to achieve the same goal during
			//		the deprecation period.
			//	removal: String?
			//		Text to indicate when in the future the behavior will be
			//		removed. Usually a version number.
			//	example:
			//	| dojo.deprecated("myApp.getTemp()", "use myApp.getLocaleTemp() instead", "1.0");

			var message = "DEPRECATED: " + behaviour;
			if(extra){ message += " " + extra; }
			if(removal){ message += " -- will be removed in version: " + removal; }
			console.warn(message);
		};

		dojo.experimental = function(/* String */ moduleName, /* String? */ extra){
			//	summary: Marks code as experimental.
			//	description:
			//		This can be used to mark a function, file, or module as
			//		experimental.	 Experimental code is not ready to be used, and the
			//		APIs are subject to change without notice.	Experimental code may be
			//		completed deleted without going through the normal deprecation
			//		process.
			//	moduleName: String
			//		The name of a module, or the name of a module file or a specific
			//		function
			//	extra: String?
			//		some additional message for the user
			//	example:
			//	| dojo.experimental("dojo.data.Result");
			//	example:
			//	| dojo.experimental("dojo.weather.toKelvin()", "PENDING approval from NOAA");

			var message = "EXPERIMENTAL: " + moduleName + " -- APIs subject to change without notice.";
			if(extra){ message += " " + extra; }
			console.warn(message);
		};
	}else{
		dojo.deprecated = dojo.experimental =  function(){};
	}

	true || has.add("dojo-modulePaths",
		// consume dojo.modulePaths processing
		1
	);
	if(1){
		// notice that modulePaths won't be applied to any require's before the dojo/_base/kernel factory is run;
		// this is the v1.6- behavior.
		if(config.modulePaths){
			dojo.deprecated("dojo.modulePaths", "use paths configuration");
			var paths = {};
			for(p in config.modulePaths){
				paths[p.replace(/\./g, "/")] = config.modulePaths[p];
			}
			require({paths:paths});
		}
	}

	true || has.add("dojo-moduleUrl",
		// include dojo.moduleUrl
		1
	);
	if(1){
		dojo.moduleUrl = function(/*String*/module, /*String?*/url){
			//	summary:
			//		Returns a URL relative to a module.
			//	example:
			//	|	var pngPath = dojo.moduleUrl("acme","images/small.png");
			//	|	console.dir(pngPath); // list the object properties
			//	|	// create an image and set it's source to pngPath's value:
			//	|	var img = document.createElement("img");
			//	|	img.src = pngPath;
			//	|	// add our image to the document
			//	|	dojo.body().appendChild(img);
			//	example:
			//		you may de-reference as far as you like down the package
			//		hierarchy.  This is sometimes handy to avoid lenghty relative
			//		urls or for building portable sub-packages. In this example,
			//		the `acme.widget` and `acme.util` directories may be located
			//		under different roots (see `dojo.registerModulePath`) but the
			//		the modules which reference them can be unaware of their
			//		relative locations on the filesystem:
			//	|	// somewhere in a configuration block
			//	|	dojo.registerModulePath("acme.widget", "../../acme/widget");
			//	|	dojo.registerModulePath("acme.util", "../../util");
			//	|
			//	|	// ...
			//	|
			//	|	// code in a module using acme resources
			//	|	var tmpltPath = dojo.moduleUrl("acme.widget","templates/template.html");
			//	|	var dataPath = dojo.moduleUrl("acme.util","resources/data.json");

			dojo.deprecated("dojo.moduleUrl()", "use require.toUrl", "2.0");

			// require.toUrl requires a filetype; therefore, just append the suffix "/*.*" to guarantee a filetype, then
			// remove the suffix from the result. This way clients can request a url w/out a filetype. This should be
			// rare, but it maintains backcompat for the v1.x line (note: dojo.moduleUrl will be removed in v2.0).
			// Notice * is an illegal filename so it won't conflict with any real path map that may exist the paths config.
			var result = null;
			if(module){
				result = require.toUrl(module.replace(/\./g, "/") + (url ? ("/" + url) : "") + "/*.*").replace(/\/\*\.\*/, "") + (url ? "" : "/");
			}
			return result;
		};
	}

	dojo._hasResource = {}; // for backward compatibility with layers built with 1.6 tooling

	return dojo;
});

},
'dojox/charting/Theme':function(){
define("dojox/charting/Theme", ["dojo/_base/lang", "dojo/_base/array","dojo/_base/declare","dojo/_base/Color",
	    "dojox/color/_base", "dojox/color/Palette", "dojox/lang/utils", "dojox/gfx/gradutils"], 
	function(lang, arr, declare, Color, colorX, Palette, dlu, dgg){ 
	
	var Theme = declare("dojox.charting.Theme", null, {
	//	summary:
	//		A Theme is a pre-defined object, primarily JSON-based, that makes up the definitions to
	//		style a chart.
	//
	//	description:
	//		While you can set up style definitions on a chart directly (usually through the various add methods
	//		on a dojox.charting.Chart object), a Theme simplifies this manual setup by allowing you to
	//		pre-define all of the various visual parameters of each element in a chart.
	//
	//		Most of the properties of a Theme are straight-forward; if something is line-based (such as
	//		an axis or the ticks on an axis), they will be defined using basic stroke parameters.  Likewise,
	//		if an element is primarily block-based (such as the background of a chart), it will be primarily
	//		fill-based.
	//
	//		In addition (for convenience), a Theme definition does not have to contain the entire JSON-based
	//		structure.  Each theme is built on top of a default theme (which serves as the basis for the theme
	//		"GreySkies"), and is mixed into the default theme object.  This allows you to create a theme based,
	//		say, solely on colors for data series.
	//
	//		Defining a new theme is relatively easy; see any of the themes in dojox.charting.themes for examples
	//		on how to define your own.
	//
	//		When you set a theme on a chart, the theme itself is deep-cloned.  This means that you cannot alter
	//		the theme itself after setting the theme value on a chart, and expect it to change your chart.  If you
	//		are looking to make alterations to a theme for a chart, the suggestion would be to create your own
	//		theme, based on the one you want to use, that makes those alterations before it is applied to a chart.
	//
	//		Finally, a Theme contains a number of functions to facilitate rendering operations on a chart--the main
	//		helper of which is the ~next~ method, in which a chart asks for the information for the next data series
	//		to be rendered.
	//
	//		A note on colors:
	//		The Theme constructor was on the use of dojox.color.Palette (in general) for creating a visually distinct
	//		set of colors for usage in a chart.  A palette is usually comprised of 5 different color definitions, and
	//		no more.  If you have a need to render a chart with more than 5 data elements, you can simply "push"
	//		new color definitions into the theme's .color array.  Make sure that you do that with the actual
	//		theme object from a Chart, and not in the theme itself (i.e. either do that before using .setTheme
	//		on a chart).
	//
	//		example:
	//			The default theme (and structure) looks like so:
	//	|	// all objects are structs used directly in dojox.gfx
	//	|	chart:{
	//	|		stroke: null,
	//	|		fill: "white",
	//	|		pageStyle: null // suggested page style as an object suitable for dojo.style()
	//	|	},
	//	|	plotarea:{
	//	|		stroke: null,
	//	|		fill: "white"
	//	|	},
	//	|	axis:{
	//	|		stroke:	{ // the axis itself
	//	|			color: "#333",
	//	|			width: 1
	//	|		},
	//	|		tick: {	// used as a foundation for all ticks
	//	|			color:     "#666",
	//	|			position:  "center",
	//	|			font:      "normal normal normal 7pt Tahoma",	// labels on axis
	//	|			fontColor: "#333"								// color of labels
	//	|		},
	//	|		majorTick:	{ // major ticks on axis, and used for major gridlines
	//	|			width:  1,
	//	|			length: 6
	//	|		},
	//	|		minorTick:	{ // minor ticks on axis, and used for minor gridlines
	//	|			width:  0.8,
	//	|			length: 3
	//	|		},
	//	|		microTick:	{ // minor ticks on axis, and used for minor gridlines
	//	|			width:  0.5,
	//	|			length: 1
	//	|		}
	//	|	},
	//	|	series: {
	//	|		stroke:  {width: 1.5, color: "#333"},		// line
	//	|		outline: {width: 0.1, color: "#ccc"},		// outline
	//	|		//shadow:  {dx: 1, dy: 1, width: 2, color: [0, 0, 0, 0.3]},
	//	|		shadow: null,								// no shadow
	//	|		fill:    "#ccc",							// fill, if appropriate
	//	|		font:    "normal normal normal 8pt Tahoma",	// if there's a label
	//	|		fontColor: "#000"							// color of labels
	//	|		labelWiring: {width: 1, color: "#ccc"},		// connect marker and target data item(slice, column, bar...)
	//	|	},
	//	|	marker: {	// any markers on a series
	//	|		symbol:  "m-3,3 l3,-6 3,6 z",				// symbol
	//	|		stroke:  {width: 1.5, color: "#333"},		// stroke
	//	|		outline: {width: 0.1, color: "#ccc"},		// outline
	//	|		shadow: null,								// no shadow
	//	|		fill:    "#ccc",							// fill if needed
	//	|		font:    "normal normal normal 8pt Tahoma",	// label
	//	|		fontColor: "#000"
	//	|	},
	//	|	indicator: {
	//	|		lineStroke:  {width: 1.5, color: "#333"},		// line
	//	|		lineOutline: {width: 0.1, color: "#ccc"},		// line outline
	//	|		lineShadow: null,								// no line shadow
	//	|		stroke:  {width: 1.5, color: "#333"},			// label background stroke
	//	|		outline: {width: 0.1, color: "#ccc"},			// label background outline
	//	|		shadow: null,									// no label background shadow
	//	|		fill:  "#ccc",									// label background fill
	//	|		radius: 3,										// radius of the label background
	//	|		font:    "normal normal normal 10pt Tahoma",	// label font
	//	|		fontColor: "#000"								// label color
	//	|		markerFill:    "#ccc",							// marker fill
	//	|		markerSymbol:  "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",	// marker symbol
	//	|		markerStroke:  {width: 1.5, color: "#333"},		// marker stroke
	//	|		markerOutline: {width: 0.1, color: "#ccc"},		// marker outline
	//	|		markerShadow: null,								// no marker shadow
	//	|	}
	//
	//	example:
	//		Defining a new theme is pretty simple:
	//	|	dojox.charting.themes.Grasslands = new dojox.charting.Theme({
	//	|		colors: [ "#70803a", "#dde574", "#788062", "#b1cc5d", "#eff2c2" ]
	//	|	});
	//	|
	//	|	myChart.setTheme(dojox.charting.themes.Grasslands);

	shapeSpaces: {shape: 1, shapeX: 1, shapeY: 1},

	constructor: function(kwArgs){
		//	summary:
		//		Initialize a theme using the keyword arguments.  Note that the arguments
		//		look like the example (above), and may include a few more parameters.
		kwArgs = kwArgs || {};

		// populate theme with defaults updating them if needed
		var def = Theme.defaultTheme;
		arr.forEach(["chart", "plotarea", "axis", "series", "marker", "indicator"], function(name){
			this[name] = lang.delegate(def[name], kwArgs[name]);
		}, this);

		// personalize theme
		if(kwArgs.seriesThemes && kwArgs.seriesThemes.length){
			this.colors  = null;
			this.seriesThemes = kwArgs.seriesThemes.slice(0);
		}else{
			this.seriesThemes = null;
			this.colors = (kwArgs.colors || Theme.defaultColors).slice(0);
		}
		this.markerThemes = null;
		if(kwArgs.markerThemes && kwArgs.markerThemes.length){
			this.markerThemes = kwArgs.markerThemes.slice(0);
		}
		this.markers = kwArgs.markers ? lang.clone(kwArgs.markers) : lang.delegate(Theme.defaultMarkers);

		// set flags
		this.noGradConv = kwArgs.noGradConv;
		this.noRadialConv = kwArgs.noRadialConv;
		if(kwArgs.reverseFills){
			this.reverseFills();
		}

		//	private housekeeping
		this._current = 0;
		this._buildMarkerArray();
	},

	clone: function(){
		//	summary:
		//		Clone the current theme.
		//	returns: dojox.charting.Theme
		//		The cloned theme; any alterations made will not affect the original.
		var theme = new Theme({
			// theme components
			chart: this.chart,
			plotarea: this.plotarea,
			axis: this.axis,
			series: this.series,
			marker: this.marker,
			// individual arrays
			colors: this.colors,
			markers: this.markers,
			indicator: this.indicator,
			seriesThemes: this.seriesThemes,
			markerThemes: this.markerThemes,
			// flags
			noGradConv: this.noGradConv,
			noRadialConv: this.noRadialConv
		});
		// copy custom methods
		arr.forEach(
			["clone", "clear", "next", "skip", "addMixin", "post", "getTick"],
			function(name){
				if(this.hasOwnProperty(name)){
					theme[name] = this[name];
				}
			},
			this
		);
		return theme;	//	dojox.charting.Theme
	},

	clear: function(){
		//	summary:
		//		Clear and reset the internal pointer to start fresh.
		this._current = 0;
	},

	next: function(elementType, mixin, doPost){
		//	summary:
		//		Get the next color or series theme.
		//	elementType: String?
		//		An optional element type (for use with series themes)
		//	mixin: Object?
		//		An optional object to mix into the theme.
		//	doPost: Boolean?
		//		A flag to post-process the results.
		//	returns: Object
		//		An object of the structure { series, marker, symbol }
		var merge = dlu.merge, series, marker;
		if(this.colors){
			series = lang.delegate(this.series);
			marker = lang.delegate(this.marker);
			var color = new Color(this.colors[this._current % this.colors.length]), old;
			// modify the stroke
			if(series.stroke && series.stroke.color){
				series.stroke = lang.delegate(series.stroke);
				old = new Color(series.stroke.color);
				series.stroke.color = new Color(color);
				series.stroke.color.a = old.a;
			}else{
				series.stroke = {color: color};
			}
			if(marker.stroke && marker.stroke.color){
				marker.stroke = lang.delegate(marker.stroke);
				old = new Color(marker.stroke.color);
				marker.stroke.color = new Color(color);
				marker.stroke.color.a = old.a;
			}else{
				marker.stroke = {color: color};
			}
			// modify the fill
			if(!series.fill || series.fill.type){
				series.fill = color;
			}else{
				old = new Color(series.fill);
				series.fill = new Color(color);
				series.fill.a = old.a;
			}
			if(!marker.fill || marker.fill.type){
				marker.fill = color;
			}else{
				old = new Color(marker.fill);
				marker.fill = new Color(color);
				marker.fill.a = old.a;
			}
		}else{
			series = this.seriesThemes ?
				merge(this.series, this.seriesThemes[this._current % this.seriesThemes.length]) :
				this.series;
			marker = this.markerThemes ?
				merge(this.marker, this.markerThemes[this._current % this.markerThemes.length]) :
				series;
		}

		var symbol = marker && marker.symbol || this._markers[this._current % this._markers.length];

		var theme = {series: series, marker: marker, symbol: symbol};
		
		// advance the counter
		++this._current;

		if(mixin){
			theme = this.addMixin(theme, elementType, mixin);
		}
		if(doPost){
			theme = this.post(theme, elementType);
		}

		return theme;	//	Object
	},

	skip: function(){
		//	summary:
		//		Skip the next internal color.
		++this._current;
	},

	addMixin: function(theme, elementType, mixin, doPost){
		//	summary:
		//		Add a mixin object to the passed theme and process.
		//	theme: dojox.charting.Theme
		//		The theme to mixin to.
		//	elementType: String
		//		The type of element in question. Can be "line", "bar" or "circle"
		//	mixin: Object|Array
		//		The object or objects to mix into the theme.
		//	doPost: Boolean
		//		If true, run the new theme through the post-processor.
		//	returns: dojox.charting.Theme
		//		The new theme.
		if(lang.isArray(mixin)){
			arr.forEach(mixin, function(m){
				theme = this.addMixin(theme, elementType, m);
			}, this);
		}else{
			var t = {};
			if("color" in mixin){
				if(elementType == "line" || elementType == "area"){
					lang.setObject("series.stroke.color", mixin.color, t);
					lang.setObject("marker.stroke.color", mixin.color, t);
				}else{
					lang.setObject("series.fill", mixin.color, t);
				}
			}
			arr.forEach(["stroke", "outline", "shadow", "fill", "font", "fontColor", "labelWiring"], function(name){
				var markerName = "marker" + name.charAt(0).toUpperCase() + name.substr(1),
					b = markerName in mixin;
				if(name in mixin){
					lang.setObject("series." + name, mixin[name], t);
					if(!b){
						lang.setObject("marker." + name, mixin[name], t);
					}
				}
				if(b){
					lang.setObject("marker." + name, mixin[markerName], t);
				}
			});
			if("marker" in mixin){
				t.symbol = mixin.marker;
			}
			theme = dlu.merge(theme, t);
		}
		if(doPost){
			theme = this.post(theme, elementType);
		}
		return theme;	//	dojox.charting.Theme
	},

	post: function(theme, elementType){
		//	summary:
		//		Process any post-shape fills.
		//	theme: dojox.charting.Theme
		//		The theme to post process with.
		//	elementType: String
		//		The type of element being filled.  Can be "bar" or "circle".
		//	returns: dojox.charting.Theme
		//		The post-processed theme.
		var fill = theme.series.fill, t;
		if(!this.noGradConv && this.shapeSpaces[fill.space] && fill.type == "linear"){
			if(elementType == "bar"){
				// transpose start and end points
				t = {
					x1: fill.y1,
					y1: fill.x1,
					x2: fill.y2,
					y2: fill.x2
				};
			}else if(!this.noRadialConv && fill.space == "shape" && (elementType == "slice" || elementType == "circle")){
				// switch to radial
				t = {
					type: "radial",
					cx: 0,
					cy: 0,
					r:  100
				};
			}
			if(t){
				return dlu.merge(theme, {series: {fill: t}});
			}
		}
		return theme;	//	dojox.charting.Theme
	},

	getTick: function(name, mixin){
		//	summary:
		//		Calculates and merges tick parameters.
		//	name: String
		//		Tick name, can be "major", "minor", or "micro".
		//	mixin: Object?
		//		Optional object to mix in to the tick.
		var tick = this.axis.tick, tickName = name + "Tick",
			merge = dlu.merge;
		if(tick){
			if(this.axis[tickName]){
				tick = merge(tick, this.axis[tickName]);
			}
		}else{
			tick = this.axis[tickName];
		}
		if(mixin){
			if(tick){
				if(mixin[tickName]){
					tick = merge(tick, mixin[tickName]);
				}
			}else{
				tick = mixin[tickName];
			}
		}
		return tick;	//	Object
	},

	inspectObjects: function(f){
		arr.forEach(["chart", "plotarea", "axis", "series", "marker", "indicator"], function(name){
			f(this[name]);
		}, this);
		if(this.seriesThemes){
			arr.forEach(this.seriesThemes, f);
		}
		if(this.markerThemes){
			arr.forEach(this.markerThemes, f);
		}
	},

	reverseFills: function(){
		this.inspectObjects(function(o){
			if(o && o.fill){
				o.fill = dgg.reverse(o.fill);
			}
		});
	},

	addMarker:function(/*String*/ name, /*String*/ segment){
		//	summary:
		//		Add a custom marker to this theme.
		//	example:
		//	|	myTheme.addMarker("Ellipse", foo);
		this.markers[name] = segment;
		this._buildMarkerArray();
	},

	setMarkers:function(/*Object*/ obj){
		//	summary:
		//		Set all the markers of this theme at once.  obj should be a
		//		dictionary of keys and path segments.
		//
		//	example:
		//	|	myTheme.setMarkers({ "CIRCLE": foo });
		this.markers = obj;
		this._buildMarkerArray();
	},

	_buildMarkerArray: function(){
		this._markers = [];
		for(var p in this.markers){
			this._markers.push(this.markers[p]);
		}
	}
});

/*=====
dojox.charting.Theme.__DefineColorArgs = function(num, colors, hue, saturation, low, high, base, generator){
	//	summary:
	//		The arguments object that can be passed to define colors for a theme.
	//	num: Number?
	//		The number of colors to generate.  Defaults to 5.
	//	colors: String[]|dojo.Color[]?
	//		A pre-defined set of colors; this is passed through to the Theme directly.
	//	hue: Number?
	//		A hue to base the generated colors from (a number from 0 - 359).
	//	saturation: Number?
	//		If a hue is passed, this is used for the saturation value (0 - 100).
	//	low: Number?
	//		An optional value to determine the lowest value used to generate a color (HSV model)
	//	high: Number?
	//		An optional value to determine the highest value used to generate a color (HSV model)
	//	base: String|dojo.Color?
	//		A base color to use if we are defining colors using dojox.color.Palette
	//	generator: String?
	//		The generator function name from dojox.color.Palette.
	this.num = num;
	this.colors = colors;
	this.hue = hue;
	this.saturation = saturation;
	this.low = low;
	this.high = high;
	this.base = base;
	this.generator = generator;
}
=====*/
lang.mixin(Theme, {
	defaultMarkers: {
		CIRCLE:   "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",
		SQUARE:   "m-3,-3 l0,6 6,0 0,-6 z",
		DIAMOND:  "m0,-3 l3,3 -3,3 -3,-3 z",
		CROSS:    "m0,-3 l0,6 m-3,-3 l6,0",
		X:        "m-3,-3 l6,6 m0,-6 l-6,6",
		TRIANGLE: "m-3,3 l3,-6 3,6 z",
		TRIANGLE_INVERTED: "m-3,-3 l3,6 3,-6 z"
	},

	defaultColors:[
		// gray skies
		"#54544c", "#858e94", "#6e767a", "#948585", "#474747"
	],

	defaultTheme: {
		// all objects are structs used directly in dojox.gfx
		chart:{
			stroke: null,
			fill: "white",
			pageStyle: null,
			titleGap:		20,
			titlePos:		"top",
			titleFont:      "normal normal bold 14pt Tahoma",	// labels on axis
			titleFontColor: "#333"
		},
		plotarea:{
			stroke: null,
			fill: "white"
		},
		// TODO: label rotation on axis
		axis:{
			stroke:	{ // the axis itself
				color: "#333",
				width: 1
			},
			tick: {	// used as a foundation for all ticks
				color:     "#666",
				position:  "center",
				font:      "normal normal normal 7pt Tahoma",	// labels on axis
				fontColor: "#333",								// color of labels
				titleGap:  15,
				titleFont: "normal normal normal 11pt Tahoma",	// labels on axis
				titleFontColor: "#333",							// color of labels
				titleOrientation: "axis"						// "axis": facing the axis, "away": facing away
			},
			majorTick:	{ // major ticks on axis, and used for major gridlines
				width:  1,
				length: 6
			},
			minorTick:	{ // minor ticks on axis, and used for minor gridlines
				width:  0.8,
				length: 3
			},
			microTick:	{ // minor ticks on axis, and used for minor gridlines
				width:  0.5,
				length: 1
			}
		},
		series: {
			// used as a "main" theme for series, sThemes augment it
			stroke:  {width: 1.5, color: "#333"},		// line
			outline: {width: 0.1, color: "#ccc"},		// outline
			//shadow:  {dx: 1, dy: 1, width: 2, color: [0, 0, 0, 0.3]},
			shadow: null,								// no shadow
			fill:    "#ccc",							// fill, if appropriate
			font:    "normal normal normal 8pt Tahoma",	// if there's a label
			fontColor: "#000",							// color of labels
			labelWiring: {width: 1, color: "#ccc"}		// connect marker and target data item(slice, column, bar...)
		},
		marker: {	// any markers on a series
			stroke:  {width: 1.5, color: "#333"},		// stroke
			outline: {width: 0.1, color: "#ccc"},		// outline
			//shadow:  {dx: 1, dy: 1, width: 2, color: [0, 0, 0, 0.3]},
			shadow: null,								// no shadow
			fill:    "#ccc",							// fill if needed
			font:    "normal normal normal 8pt Tahoma",	// label
			fontColor: "#000"
		},
		indicator: {
			lineStroke:  {width: 1.5, color: "#333"},		
			lineOutline: {width: 0.1, color: "#ccc"},		
			lineShadow: null,
			stroke:  {width: 1.5, color: "#333"},		
			outline: {width: 0.1, color: "#ccc"},		
			shadow: null,								
			fill : "#ccc",
			radius: 3,
			font:    "normal normal normal 10pt Tahoma",	
			fontColor: "#000",							
			markerFill:    "#ccc",							
			markerSymbol:  "m-3,0 c0,-4 6,-4 6,0 m-6,0 c0,4 6,4 6,0",			
			markerStroke:  {width: 1.5, color: "#333"},		
			markerOutline: {width: 0.1, color: "#ccc"},		
			markerShadow: null								
		}
	},

	defineColors: function(kwArgs){
		//	summary:
		//		Generate a set of colors for the theme based on keyword
		//		arguments.
		//	kwArgs: dojox.charting.Theme.__DefineColorArgs
		//		The arguments object used to define colors.
		//	returns: dojo.Color[]
		//		An array of colors for use in a theme.
		//
		//	example:
		//	|	var colors = dojox.charting.Theme.defineColors({
		//	|		base: "#369",
		//	|		generator: "compound"
		//	|	});
		//
		//	example:
		//	|	var colors = dojox.charting.Theme.defineColors({
		//	|		hue: 60,
		//	|		saturation: 90,
		//	|		low: 30,
		//	|		high: 80
		//	|	});
		kwArgs = kwArgs || {};
		var l, c = [], n = kwArgs.num || 5;	// the number of colors to generate
		if(kwArgs.colors){
			// we have an array of colors predefined, so fix for the number of series.
			l = kwArgs.colors.length;
			for(var i = 0; i < n; i++){
				c.push(kwArgs.colors[i % l]);
			}
			return c;	//	dojo.Color[]
		}
		if(kwArgs.hue){
			// single hue, generate a set based on brightness
			var s = kwArgs.saturation || 100,	// saturation
				st = kwArgs.low || 30,
				end = kwArgs.high || 90;
			// we'd like it to be a little on the darker side.
			l = (end + st) / 2;
			// alternately, use "shades"
			return colorX.Palette.generate(
				colorX.fromHsv(kwArgs.hue, s, l), "monochromatic"
			).colors;
		}
		if(kwArgs.generator){
			//	pass a base color and the name of a generator
			return colorX.Palette.generate(kwArgs.base, kwArgs.generator).colors;
		}
		return c;	//	dojo.Color[]
	},
	
	generateGradient: function(fillPattern, colorFrom, colorTo){
		var fill = lang.delegate(fillPattern);
		fill.colors = [
			{offset: 0, color: colorFrom},
			{offset: 1, color: colorTo}
		];
		return fill;
	},
	
	generateHslColor: function(color, luminance){
		color = new Color(color);
		var hsl    = color.toHsl(),
			result = colorX.fromHsl(hsl.h, hsl.s, luminance);
		result.a = color.a;	// add missing opacity
		return result;
	},

	generateHslGradient: function(color, fillPattern, lumFrom, lumTo){
		color = new Color(color);
		var hsl       = color.toHsl(),
			colorFrom = colorX.fromHsl(hsl.h, hsl.s, lumFrom),
			colorTo   = colorX.fromHsl(hsl.h, hsl.s, lumTo);
		colorFrom.a = colorTo.a = color.a;	// add missing opacity
		return Theme.generateGradient(fillPattern, colorFrom, colorTo);	// Object
	}
});

return Theme;
});

},
'dojo/store/Observable':function(){
define(["../_base/kernel", "../_base/lang", "../_base/Deferred", "../_base/array"
], function(kernel, lang, Deferred, array) {
	// module:
	//		dojo/store/Observable
	// summary:
	//		TODOC

var ds = lang.getObject("dojo.store", true);

return ds.Observable = function(store){
	// summary:
	//		The Observable store wrapper takes a store and sets an observe method on query()
	//		results that can be used to monitor results for changes.
	//
	// description:
	//		Observable wraps an existing store so that notifications can be made when a query
	//		is performed.
	//
	// example:
	//		Create a Memory store that returns an observable query, and then log some
	//		information about that query.
	//
	//	|	var store = dojo.store.Observable(new dojo.store.Memory({
	//	|		data: [
	//	|			{id: 1, name: "one", prime: false},
	//	|			{id: 2, name: "two", even: true, prime: true},
	//	|			{id: 3, name: "three", prime: true},
	//	|			{id: 4, name: "four", even: true, prime: false},
	//	|			{id: 5, name: "five", prime: true}
	//	|		]
	//	|	}));
	//	|	var changes = [], results = store.query({ prime: true });
	//	|	var observer = results.observe(function(object, previousIndex, newIndex){
	//	|		changes.push({previousIndex:previousIndex, newIndex:newIndex, object:object});
	//	|	});
	//
	//		See the Observable tests for more information.

	var undef, queryUpdaters = [], revision = 0;
	// a Comet driven store could directly call notify to notify observers when data has
	// changed on the backend
	store.notify = function(object, existingId){
		revision++;
		var updaters = queryUpdaters.slice();
		for(var i = 0, l = updaters.length; i < l; i++){
			updaters[i](object, existingId);
		}
	};
	var originalQuery = store.query;
	store.query = function(query, options){
		options = options || {};
		var results = originalQuery.apply(this, arguments);
		if(results && results.forEach){
			var nonPagedOptions = lang.mixin({}, options);
			delete nonPagedOptions.start;
			delete nonPagedOptions.count;

			var queryExecutor = store.queryEngine && store.queryEngine(query, nonPagedOptions);
			var queryRevision = revision;
			var listeners = [], queryUpdater;
			results.observe = function(listener, includeObjectUpdates){
				if(listeners.push(listener) == 1){
					// first listener was added, create the query checker and updater
					queryUpdaters.push(queryUpdater = function(changed, existingId){
						Deferred.when(results, function(resultsArray){
							var atEnd = resultsArray.length != options.count;
							var i, l, listener;
							if(++queryRevision != revision){
								throw new Error("Query is out of date, you must observe() the query prior to any data modifications");
							}
							var removedObject, removedFrom = -1, insertedInto = -1;
							if(existingId !== undef){
								// remove the old one
								for(i = 0, l = resultsArray.length; i < l; i++){
									var object = resultsArray[i];
									if(store.getIdentity(object) == existingId){
										removedObject = object;
										removedFrom = i;
										if(queryExecutor || !changed){// if it was changed and we don't have a queryExecutor, we shouldn't remove it because updated objects would be eliminated
											resultsArray.splice(i, 1);
										}
										break;
									}
								}
							}
							if(queryExecutor){
								// add the new one
								if(changed &&
										// if a matches function exists, use that (probably more efficient)
										(queryExecutor.matches ? queryExecutor.matches(changed) : queryExecutor([changed]).length)){

									var firstInsertedInto = removedFrom > -1 ? 
										removedFrom : // put back in the original slot so it doesn't move unless it needs to (relying on a stable sort below)
										resultsArray.length;
									resultsArray.splice(firstInsertedInto, 0, changed); // add the new item
									insertedInto = array.indexOf(queryExecutor(resultsArray), changed); // sort it
									// we now need to push the chagne back into the original results array
									resultsArray.splice(firstInsertedInto, 1); // remove the inserted item from the previous index
									
									if((options.start && insertedInto == 0) ||
										(!atEnd && insertedInto == resultsArray.length)){
										// if it is at the end of the page, assume it goes into the prev or next page
										insertedInto = -1;
									}else{
										resultsArray.splice(insertedInto, 0, changed); // and insert into the results array with the correct index
									}
								}
							}else if(changed && !options.start){
								// we don't have a queryEngine, so we can't provide any information
								// about where it was inserted, but we can at least indicate a new object
								insertedInto = removedFrom >= 0 ? removedFrom : (store.defaultIndex || 0);
							}
							if((removedFrom > -1 || insertedInto > -1) &&
									(includeObjectUpdates || !queryExecutor || (removedFrom != insertedInto))){
								var copyListeners = listeners.slice();
								for(i = 0;listener = copyListeners[i]; i++){
									listener(changed || removedObject, removedFrom, insertedInto);
								}
							}
						});
					});
				}
				return {
					cancel: function(){
						// remove this listener
						var index = array.indexOf(listeners, listener);
						if(index > -1){ // check to make sure we haven't already called cancel
							listeners.splice(index, 1);
							if(!listeners.length){
								// no more listeners, remove the query updater too
								queryUpdaters.splice(array.indexOf(queryUpdaters, queryUpdater), 1);
							}
						}						
					}
				};
			};
		}
		return results;
	};
	var inMethod;
	function whenFinished(method, action){
		var original = store[method];
		if(original){
			store[method] = function(value){
				if(inMethod){
					// if one method calls another (like add() calling put()) we don't want two events
					return original.apply(this, arguments);
				}
				inMethod = true;
				try{
					var results = original.apply(this, arguments);
					Deferred.when(results, function(results){
						action((typeof results == "object" && results) || value);
					});
					return results;
				}finally{
					inMethod = false;
				}
			};
		}
	}
	// monitor for updates by listening to these methods
	whenFinished("put", function(object){
		store.notify(object, store.getIdentity(object));
	});
	whenFinished("add", function(object){
		store.notify(object);
	});
	whenFinished("remove", function(id){
		store.notify(undefined, id);
	});

	return store;
};
});

},
'dojo/main':function(){
define([
	"./_base/kernel",
	"./has",
	"require",
	"./_base/sniff",
	"./_base/lang",
	"./_base/array",
	"./ready",
	"./_base/declare",
	"./_base/connect",
	"./_base/Deferred",
	"./_base/json",
	"./_base/Color",
	"./has!dojo-firebug?./_firebug/firebug",
	"./_base/browser",
	"require"], function(dojo, has, require, sniff, lang, array, ready){
	// module:
	//		dojo/main
	// summary:
	//		This is the package main module for the dojo package; it loads dojo base appropriate for the execution environment.

	// the preferred way to load the dojo firebug console is by setting has("dojo-firebug") true in dojoConfig
	// the isDebug config switch is for backcompat and will work fine in sync loading mode; it works in
	// async mode too, but there's no guarantee when the module is loaded; therefore, if you need a firebug
	// console guarnanteed at a particular spot in an app, either set config.has["dojo-firebug"] true before
	// loading dojo.js or explicitly include dojo/_firebug/firebug in a dependency list.
	if(dojo.config.isDebug){
		require(["./_firebug/firebug"]);
	}

	// dojoConfig.require is deprecated; use the loader configuration property deps
	true || has.add("dojo-config-require", 1);
	if(1){
		var deps= dojo.config.require;
		if(deps){
			// dojo.config.require may be dot notation
			deps= array.map(lang.isArray(deps) ? deps : [deps], function(item){ return item.replace(/\./g, "/"); });
			if(dojo.isAsync){
				require(deps);
			}else{
				// this is a bit janky; in 1.6- dojo is defined before these requires are applied; but in 1.7+
				// dojo isn't defined until returning from this module; this is only a problem in sync mode
				// since we're in sync mode, we know we've got our loader with its priority ready queue
				ready(1, function(){require(deps);});
			}
		}
	}

	return dojo;
});

},
'dojox/charting/themes/common':function(){
define("dojox/charting/themes/common", ["dojo/_base/lang"], function(lang){
	return lang.getObject("dojox.charting.themes", true);
});

},
'dojo/on':function(){
define(["./has!dom-addeventlistener?:./aspect", "./_base/kernel", "./has"], function(aspect, dojo, has){
	// summary:
	//		The export of this module is a function that provides core event listening functionality. With this function
	//		you can provide a target, event type, and listener to be notified of
	//		future matching events that are fired.
	// target: Element|Object
	//		This is the target object or DOM element that to receive events from
	// type: String|Function
	// 		This is the name of the event to listen for or an extension event type.
	// listener: Function
	// 		This is the function that should be called when the event fires.
	// returns: Object
	// 		An object with a remove() method that can be used to stop listening for this
	// 		event.
	// description:
	// 		To listen for "click" events on a button node, we can do:
	// 		|	define(["dojo/on"], function(listen){
	// 		|		on(button, "click", clickHandler);
	//		|		...
	//  	Evented JavaScript objects can also have their own events.
	// 		|	var obj = new Evented;
	//		|	on(obj, "foo", fooHandler);
	//		And then we could publish a "foo" event:
	//		|	on.emit(obj, "foo", {key: "value"});
	//		We can use extension events as well. For example, you could listen for a tap gesture:
	// 		|	define(["dojo/on", "dojo/gesture/tap", function(listen, tap){
	// 		|		on(button, tap, tapHandler);
	//		|		...
	//		which would trigger fooHandler. Note that for a simple object this is equivalent to calling:
	//		|	obj.onfoo({key:"value"});
	//		If you use on.emit on a DOM node, it will use native event dispatching when possible.

 	"use strict";
	if(1){ // check to make sure we are in a browser, this module should work anywhere
		var major = window.ScriptEngineMajorVersion;
		has.add("jscript", major && (major() + ScriptEngineMinorVersion() / 10));
		has.add("event-orientationchange", has("touch") && !has("android")); // TODO: how do we detect this?
	}
	var on = function(target, type, listener, dontFix){
		if(target.on){ 
			// delegate to the target's on() method, so it can handle it's own listening if it wants
			return target.on(type, listener);
		}
		// delegate to main listener code
		return on.parse(target, type, listener, addListener, dontFix, this);
	};
	on.pausable =  function(target, type, listener, dontFix){
		// summary:
		//		This function acts the same as on(), but with pausable functionality. The
		// 		returned signal object has pause() and resume() functions. Calling the
		//		pause() method will cause the listener to not be called for future events. Calling the
		//		resume() method will cause the listener to again be called for future events.
		var paused;
		var signal = on(target, type, function(){
			if(!paused){
				return listener.apply(this, arguments);
			}
		}, dontFix);
		signal.pause = function(){
			paused = true;
		};
		signal.resume = function(){
			paused = false;
		};
		return signal;
	};
	on.once = function(target, type, listener, dontFix){
		// summary:
		//		This function acts the same as on(), but will only call the listener once. The 
		// 		listener will be called for the first
		//		event that takes place and then listener will automatically be removed.
		var signal = on(target, type, function(){
			// remove this listener
			signal.remove();
			// proceed to call the listener
			return listener.apply(this, arguments);
		});
		return signal;
	};
	on.parse = function(target, type, listener, addListener, dontFix, matchesTarget){
		if(type.call){
			// event handler function
			// on(node, dojo.touch.press, touchListener);
			return type.call(matchesTarget, target, listener);
		}

		if(type.indexOf(",") > -1){
			// we allow comma delimited event names, so you can register for multiple events at once
			var events = type.split(/\s*,\s*/);
			var handles = [];
			var i = 0;
			var eventName;
			while(eventName = events[i++]){
				handles.push(addListener(target, eventName, listener, dontFix, matchesTarget));
			}
			handles.remove = function(){
				for(var i = 0; i < handles.length; i++){
					handles[i].remove();
				}
			};
			return handles;
		}
		return addListener(target, type, listener, dontFix, matchesTarget)
	};
	var touchEvents = /^touch/;
	function addListener(target, type, listener, dontFix, matchesTarget){		
		// event delegation:
		var selector = type.match(/(.*):(.*)/);
		// if we have a selector:event, the last one is interpreted as an event, and we use event delegation
		if(selector){
			type = selector[2];
			selector = selector[1];
			// create the extension event for selectors and directly call it
			return on.selector(selector, type).call(matchesTarget, target, listener);
		}
		// test to see if it a touch event right now, so we don't have to do it every time it fires
		if(has("touch")){
			if(touchEvents.test(type)){
				// touch event, fix it
				listener = fixTouchListener(listener);
			}
			if(!has("event-orientationchange") && (type == "orientationchange")){
				//"orientationchange" not supported <= Android 2.1, 
				//but works through "resize" on window
				type = "resize"; 
				target = window;
				listener = fixTouchListener(listener);
			} 
		}
		// normal path, the target is |this|
		if(target.addEventListener){
			// the target has addEventListener, which should be used if available (might or might not be a node, non-nodes can implement this method as well)
			// check for capture conversions
			var capture = type in captures;
			target.addEventListener(capture ? captures[type] : type, listener, capture);
			// create and return the signal
			return {
				remove: function(){
					target.removeEventListener(type, listener, capture);
				}
			};
		}
		type = "on" + type;
		if(fixAttach && target.attachEvent){
			return fixAttach(target, type, listener);
		}
	 	throw new Error("Target must be an event emitter");
	}

	on.selector = function(selector, eventType, children){
		// summary:
		//		Creates a new extension event with event delegation. This is based on
		// 		the provided event type (can be extension event) that
		// 		only calls the listener when the CSS selector matches the target of the event.
		//	selector:
		//		The CSS selector to use for filter events and determine the |this| of the event listener.
		//	eventType:
		//		The event to listen for
		// children:
		//		Indicates if children elements of the selector should be allowed. This defaults to 
		// 		true (except in the case of normally non-bubbling events like mouse.enter, in which case it defaults to false).
		//	example:
		//		define(["dojo/on", "dojo/mouse"], function(listen, mouse){
		//			on(node, on.selector(".my-class", mouse.enter), handlerForMyHover);
		return function(target, listener){
			var matchesTarget = this;
			var bubble = eventType.bubble;
			if(bubble){
				// the event type doesn't naturally bubble, but has a bubbling form, use that
				eventType = bubble;
			}else if(children !== false){
				// for normal bubbling events we default to allowing children of the selector
				children = true;
			}
			return on(target, eventType, function(event){
				var eventTarget = event.target;
				// see if we have a valid matchesTarget or default to dojo.query
				matchesTarget = matchesTarget && matchesTarget.matches ? matchesTarget : dojo.query;
				// there is a selector, so make sure it matches
				while(!matchesTarget.matches(eventTarget, selector, target)){
					if(eventTarget == target || !children || !(eventTarget = eventTarget.parentNode)){ // intentional assignment
						return;
					}
				}
				return listener.call(eventTarget, event);
			});
		};
	};

	function syntheticPreventDefault(){
		this.cancelable = false;
	}
	function syntheticStopPropagation(){
		this.bubbles = false;
	}
	var slice = [].slice,
		syntheticDispatch = on.emit = function(target, type, event){
		// summary:
		//		Fires an event on the target object.
		//	target:
		//		The target object to fire the event on. This can be a DOM element or a plain 
		// 		JS object. If the target is a DOM element, native event emiting mechanisms
		//		are used when possible.
		//	type:
		//		The event type name. You can emulate standard native events like "click" and 
		// 		"mouseover" or create custom events like "open" or "finish".
		//	event:
		//		An object that provides the properties for the event. See https://developer.mozilla.org/en/DOM/event.initEvent 
		// 		for some of the properties. These properties are copied to the event object.
		//		Of particular importance are the cancelable and bubbles properties. The
		//		cancelable property indicates whether or not the event has a default action
		// 		that can be cancelled. The event is cancelled by calling preventDefault() on
		// 		the event object. The bubbles property indicates whether or not the
		//		event will bubble up the DOM tree. If bubbles is true, the event will be called
		//		on the target and then each parent successively until the top of the tree
		//		is reached or stopPropagation() is called. Both bubbles and cancelable 
		// 		default to false.
		//	returns:
		//		If the event is cancelable and the event is not cancelled,
		// 		emit will return true. If the event is cancelable and the event is cancelled,
		// 		emit will return false.
		//	details:
		//		Note that this is designed to emit events for listeners registered through
		//		dojo/on. It should actually work with any event listener except those
		// 		added through IE's attachEvent (IE8 and below's non-W3C event emiting
		// 		doesn't support custom event types). It should work with all events registered
		// 		through dojo/on. Also note that the emit method does do any default
		// 		action, it only returns a value to indicate if the default action should take
		// 		place. For example, emiting a keypress event would not cause a character
		// 		to appear in a textbox.
		//	example:
		//		To fire our own click event
		//	|	on.emit(dojo.byId("button"), "click", {
		//	|		cancelable: true,
		//	|		bubbles: true,
		//	|		screenX: 33,
		//	|		screenY: 44
		//	|	});
		//		We can also fire our own custom events:
		//	|	on.emit(dojo.byId("slider"), "slide", {
		//	|		cancelable: true,
		//	|		bubbles: true,
		//	|		direction: "left-to-right"
		//	|	});
		var args = slice.call(arguments, 2);
		var method = "on" + type;
		if("parentNode" in target){
			// node (or node-like), create event controller methods
			var newEvent = args[0] = {};
			for(var i in event){
				newEvent[i] = event[i];
			}
			newEvent.preventDefault = syntheticPreventDefault;
			newEvent.stopPropagation = syntheticStopPropagation;
			newEvent.target = target;
			newEvent.type = type;
			event = newEvent;
		}
		do{
			// call any node which has a handler (note that ideally we would try/catch to simulate normal event propagation but that causes too much pain for debugging)
			target[method] && target[method].apply(target, args);
			// and then continue up the parent node chain if it is still bubbling (if started as bubbles and stopPropagation hasn't been called)
		}while(event && event.bubbles && (target = target.parentNode));
		return event && event.cancelable && event; // if it is still true (was cancelable and was cancelled), return the event to indicate default action should happen
	};
	var captures = {}; 
	if(has("dom-addeventlistener")){
		// normalize focusin and focusout
		captures = {
			focusin: "focus",
			focusout: "blur"
		};
		if(has("opera")){
			captures.keydown = "keypress"; // this one needs to be transformed because Opera doesn't support repeating keys on keydown (and keypress works because it incorrectly fires on all keydown events)
		}

		// emiter that works with native event handling
		on.emit = function(target, type, event){
			if(target.dispatchEvent && document.createEvent){
				// use the native event emiting mechanism if it is available on the target object
				// create a generic event				
				// we could create branch into the different types of event constructors, but 
				// that would be a lot of extra code, with little benefit that I can see, seems 
				// best to use the generic constructor and copy properties over, making it 
				// easy to have events look like the ones created with specific initializers
				var nativeEvent = document.createEvent("HTMLEvents");
				nativeEvent.initEvent(type, !!event.bubbles, !!event.cancelable);
				// and copy all our properties over
				for(var i in event){
					var value = event[i];
					if(!(i in nativeEvent)){
						nativeEvent[i] = event[i];
					}
				}
				return target.dispatchEvent(nativeEvent) && nativeEvent;
			}
			return syntheticDispatch.apply(on, arguments); // emit for a non-node
		};
	}else{
		// no addEventListener, basically old IE event normalization
		on._fixEvent = function(evt, sender){
			// summary:
			//		normalizes properties on the event object including event
			//		bubbling methods, keystroke normalization, and x/y positions
			// evt:
			//		native event object
			// sender:
			//		node to treat as "currentTarget"
			if(!evt){
				var w = sender && (sender.ownerDocument || sender.document || sender).parentWindow || window;
				evt = w.event;
			}
			if(!evt){return(evt);}
			if(!evt.target){ // check to see if it has been fixed yet
				evt.target = evt.srcElement;
				evt.currentTarget = (sender || evt.srcElement);
				if(evt.type == "mouseover"){
					evt.relatedTarget = evt.fromElement;
				}
				if(evt.type == "mouseout"){
					evt.relatedTarget = evt.toElement;
				}
				if(!evt.stopPropagation){
					evt.stopPropagation = stopPropagation;
					evt.preventDefault = preventDefault;
				}
				switch(evt.type){
					case "keypress":
						var c = ("charCode" in evt ? evt.charCode : evt.keyCode);
						if (c==10){
							// CTRL-ENTER is CTRL-ASCII(10) on IE, but CTRL-ENTER on Mozilla
							c=0;
							evt.keyCode = 13;
						}else if(c==13||c==27){
							c=0; // Mozilla considers ENTER and ESC non-printable
						}else if(c==3){
							c=99; // Mozilla maps CTRL-BREAK to CTRL-c
						}
						// Mozilla sets keyCode to 0 when there is a charCode
						// but that stops the event on IE.
						evt.charCode = c;
						_setKeyChar(evt);
						break;
				}
			}
			return evt;
		};
		var IESignal = function(handle){
			this.handle = handle;
		};
		IESignal.prototype.remove = function(){
			delete _dojoIEListeners_[this.handle];
		};
		var fixListener = function(listener){
			// this is a minimal function for closing on the previous listener with as few as variables as possible
			return function(evt){
				evt = on._fixEvent(evt, this);
				return listener.call(this, evt);
			}
		}
		var fixAttach = function(target, type, listener){
			listener = fixListener(listener);
			if(((target.ownerDocument ? target.ownerDocument.parentWindow : target.parentWindow || target.window || window) != top || 
						has("jscript") < 5.8) && 
					!has("config-_allow_leaks")){
				// IE will leak memory on certain handlers in frames (IE8 and earlier) and in unattached DOM nodes for JScript 5.7 and below.
				// Here we use global redirection to solve the memory leaks
				if(typeof _dojoIEListeners_ == "undefined"){
					_dojoIEListeners_ = [];
				}
				var emiter = target[type];
				if(!emiter || !emiter.listeners){
					var oldListener = emiter;
					target[type] = emiter = Function('event', 'var callee = arguments.callee; for(var i = 0; i<callee.listeners.length; i++){var listener = _dojoIEListeners_[callee.listeners[i]]; if(listener){listener.call(this,event);}}');
					emiter.listeners = [];
					emiter.global = this;
					if(oldListener){
						emiter.listeners.push(_dojoIEListeners_.push(oldListener) - 1);
					}
				}
				var handle;
				emiter.listeners.push(handle = (emiter.global._dojoIEListeners_.push(listener) - 1));
				return new IESignal(handle);
			}
			return aspect.after(target, type, listener, true);
		};

		var _setKeyChar = function(evt){
			evt.keyChar = evt.charCode ? String.fromCharCode(evt.charCode) : '';
			evt.charOrCode = evt.keyChar || evt.keyCode;
		};
		// Called in Event scope
		var stopPropagation = function(){
			this.cancelBubble = true;
		};
		var preventDefault = on._preventDefault = function(){
			// Setting keyCode to 0 is the only way to prevent certain keypresses (namely
			// ctrl-combinations that correspond to menu accelerator keys).
			// Otoh, it prevents upstream listeners from getting this information
			// Try to split the difference here by clobbering keyCode only for ctrl
			// combinations. If you still need to access the key upstream, bubbledKeyCode is
			// provided as a workaround.
			this.bubbledKeyCode = this.keyCode;
			if(this.ctrlKey){
				try{
					// squelch errors when keyCode is read-only
					// (e.g. if keyCode is ctrl or shift)
					this.keyCode = 0;
				}catch(e){
				}
			}
			this.returnValue = false;
		};
	}
	if(has("touch")){ 
		var Event = function (){};
		var windowOrientation = window.orientation; 
		var fixTouchListener = function(listener){ 
			return function(originalEvent){ 
				//Event normalization(for ontouchxxx and resize): 
				//1.incorrect e.pageX|pageY in iOS 
				//2.there are no "e.rotation", "e.scale" and "onorientationchange" in Andriod
				//3.More TBD e.g. force | screenX | screenX | clientX | clientY | radiusX | radiusY

				// see if it has already been corrected
				var event = originalEvent.corrected;
				if(!event){
					var type = originalEvent.type;
					try{
						delete originalEvent.type; // on some JS engines (android), deleting properties make them mutable
					}catch(e){} 
					if(originalEvent.type){
						// deleting properties doesn't work (older iOS), have to use delegation
						Event.prototype = originalEvent;
						var event = new Event;
						// have to delegate methods to make them work
						event.preventDefault = function(){
							originalEvent.preventDefault();
						};
						event.stopPropagation = function(){
							originalEvent.stopPropagation();
						};
					}else{
						// deletion worked, use property as is
						event = originalEvent;
						event.type = type;
					}
					originalEvent.corrected = event;
					if(type == 'resize'){
						if(windowOrientation == window.orientation){ 
							return null;//double tap causes an unexpected 'resize' in Andriod 
						} 
						windowOrientation = window.orientation;
						event.type = "orientationchange"; 
						return listener.call(this, event);
					}
					// We use the original event and augment, rather than doing an expensive mixin operation
					if(!("rotation" in event)){ // test to see if it has rotation
						event.rotation = 0; 
						event.scale = 1;
					}
					//use event.changedTouches[0].pageX|pageY|screenX|screenY|clientX|clientY|target
					var firstChangeTouch = event.changedTouches[0];
					for(var i in firstChangeTouch){ // use for-in, we don't need to have dependency on dojo/_base/lang here
						delete event[i]; // delete it first to make it mutable
						event[i] = firstChangeTouch[i];
					}
				}
				return listener.call(this, event); 
			}; 
		}; 
	}
	return on;
});

},
'dojox/charting/plot2d/common':function(){
define("dojox/charting/plot2d/common", ["dojo/_base/lang", "dojo/_base/array", "dojo/_base/Color", 
		"dojox/gfx", "dojox/lang/functional", "../scaler/common"], 
	function(lang, arr, Color, g, df, sc){
	
	var common = lang.getObject("dojox.charting.plot2d.common", true);
	
	return lang.mixin(common, {	
		doIfLoaded: sc.doIfLoaded,
		makeStroke: function(stroke){
			if(!stroke){ return stroke; }
			if(typeof stroke == "string" || stroke instanceof Color){
				stroke = {color: stroke};
			}
			return g.makeParameters(g.defaultStroke, stroke);
		},
		augmentColor: function(target, color){
			var t = new Color(target),
				c = new Color(color);
			c.a = t.a;
			return c;
		},
		augmentStroke: function(stroke, color){
			var s = common.makeStroke(stroke);
			if(s){
				s.color = common.augmentColor(s.color, color);
			}
			return s;
		},
		augmentFill: function(fill, color){
			var fc, c = new Color(color);
			if(typeof fill == "string" || fill instanceof Color){
				return common.augmentColor(fill, color);
			}
			return fill;
		},

		defaultStats: {
			vmin: Number.POSITIVE_INFINITY, vmax: Number.NEGATIVE_INFINITY,
			hmin: Number.POSITIVE_INFINITY, hmax: Number.NEGATIVE_INFINITY
		},

		collectSimpleStats: function(series){
			var stats = lang.delegate(common.defaultStats);
			for(var i = 0; i < series.length; ++i){
				var run = series[i];
				for(var j = 0; j < run.data.length; j++){
					if(run.data[j] !== null){
						if(typeof run.data[j] == "number"){
							// 1D case
							var old_vmin = stats.vmin, old_vmax = stats.vmax;
							if(!("ymin" in run) || !("ymax" in run)){
								arr.forEach(run.data, function(val, i){
									if(val !== null){
										var x = i + 1, y = val;
										if(isNaN(y)){ y = 0; }
										stats.hmin = Math.min(stats.hmin, x);
										stats.hmax = Math.max(stats.hmax, x);
										stats.vmin = Math.min(stats.vmin, y);
										stats.vmax = Math.max(stats.vmax, y);
									}
								});
							}
							if("ymin" in run){ stats.vmin = Math.min(old_vmin, run.ymin); }
							if("ymax" in run){ stats.vmax = Math.max(old_vmax, run.ymax); }
						}else{
							// 2D case
							var old_hmin = stats.hmin, old_hmax = stats.hmax,
								old_vmin = stats.vmin, old_vmax = stats.vmax;
							if(!("xmin" in run) || !("xmax" in run) || !("ymin" in run) || !("ymax" in run)){
								arr.forEach(run.data, function(val, i){
									if(val !== null){
										var x = "x" in val ? val.x : i + 1, y = val.y;
										if(isNaN(x)){ x = 0; }
										if(isNaN(y)){ y = 0; }
										stats.hmin = Math.min(stats.hmin, x);
										stats.hmax = Math.max(stats.hmax, x);
										stats.vmin = Math.min(stats.vmin, y);
										stats.vmax = Math.max(stats.vmax, y);
									}
								});
							}
							if("xmin" in run){ stats.hmin = Math.min(old_hmin, run.xmin); }
							if("xmax" in run){ stats.hmax = Math.max(old_hmax, run.xmax); }
							if("ymin" in run){ stats.vmin = Math.min(old_vmin, run.ymin); }
							if("ymax" in run){ stats.vmax = Math.max(old_vmax, run.ymax); }
						}

						break;
					}
				}
			}
			return stats;
		},

		calculateBarSize: function(/* Number */ availableSize, /* Object */ opt, /* Number? */ clusterSize){
			if(!clusterSize){
				clusterSize = 1;
			}
			var gap = opt.gap, size = (availableSize - 2 * gap) / clusterSize;
			if("minBarSize" in opt){
				size = Math.max(size, opt.minBarSize);
			}
			if("maxBarSize" in opt){
				size = Math.min(size, opt.maxBarSize);
			}
			size = Math.max(size, 1);
			gap = (availableSize - size * clusterSize) / 2;
			return {size: size, gap: gap};	// Object
		},

		collectStackedStats: function(series){
			// collect statistics
			var stats = lang.clone(common.defaultStats);
			if(series.length){
				// 1st pass: find the maximal length of runs
				stats.hmin = Math.min(stats.hmin, 1);
				stats.hmax = df.foldl(series, "seed, run -> Math.max(seed, run.data.length)", stats.hmax);
				// 2nd pass: stack values
				for(var i = 0; i < stats.hmax; ++i){
					var v = series[0].data[i];
                    v = v && (typeof v == "number" ? v : v.y);
					if(isNaN(v)){ v = 0; }
					stats.vmin = Math.min(stats.vmin, v);
					for(var j = 1; j < series.length; ++j){
						var t = series[j].data[i];
                        t = t && (typeof t == "number" ? t : t.y);
						if(isNaN(t)){ t = 0; }
						v += t;
					}
					stats.vmax = Math.max(stats.vmax, v);
				}
			}
			return stats;
		},

		curve: function(/* Number[] */a, /* Number|String */tension){
			//	FIX for #7235, submitted by Enzo Michelangeli.
			//	Emulates the smoothing algorithms used in a famous, unnamed spreadsheet
			//		program ;)
			var array = a.slice(0);
			if(tension == "x") {
				array[array.length] = arr[0];   // add a last element equal to the first, closing the loop
			}
			var p=arr.map(array, function(item, i){
				if(i==0){ return "M" + item.x + "," + item.y; }
				if(!isNaN(tension)) { // use standard Dojo smoothing in tension is numeric
					var dx=item.x-array[i-1].x, dy=array[i-1].y;
					return "C"+(item.x-(tension-1)*(dx/tension))+","+dy+" "+(item.x-(dx/tension))+","+item.y+" "+item.x+","+item.y;
				} else if(tension == "X" || tension == "x" || tension == "S") {
					// use Excel "line smoothing" algorithm (http://xlrotor.com/resources/files.shtml)
					var p0, p1 = array[i-1], p2 = array[i], p3;
					var bz1x, bz1y, bz2x, bz2y;
					var f = 1/6;
					if(i==1) {
						if(tension == "x") {
							p0 = array[array.length-2];
						} else { // "tension == X || tension == "S"
							p0 = p1;
						}
						f = 1/3;
					} else {
						p0 = array[i-2];
					}
					if(i==(array.length-1)) {
						if(tension == "x") {
							p3 = array[1];
						} else { // "tension == X || tension == "S"
							p3 = p2;
						}
						f = 1/3;
					} else {
						p3 = array[i+1];
					}
					var p1p2 = Math.sqrt((p2.x-p1.x)*(p2.x-p1.x)+(p2.y-p1.y)*(p2.y-p1.y));
					var p0p2 = Math.sqrt((p2.x-p0.x)*(p2.x-p0.x)+(p2.y-p0.y)*(p2.y-p0.y));
					var p1p3 = Math.sqrt((p3.x-p1.x)*(p3.x-p1.x)+(p3.y-p1.y)*(p3.y-p1.y));

					var p0p2f = p0p2 * f;
					var p1p3f = p1p3 * f;

					if(p0p2f > p1p2/2 && p1p3f > p1p2/2) {
						p0p2f = p1p2/2;
						p1p3f = p1p2/2;
					} else if(p0p2f > p1p2/2) {
						p0p2f = p1p2/2;
						p1p3f = p1p2/2 * p1p3/p0p2;
					} else if(p1p3f > p1p2/2) {
						p1p3f = p1p2/2;
						p0p2f = p1p2/2 * p0p2/p1p3;
					}

					if(tension == "S") {
						if(p0 == p1) { p0p2f = 0; }
						if(p2 == p3) { p1p3f = 0; }
					}

					bz1x = p1.x + p0p2f*(p2.x - p0.x)/p0p2;
					bz1y = p1.y + p0p2f*(p2.y - p0.y)/p0p2;
					bz2x = p2.x - p1p3f*(p3.x - p1.x)/p1p3;
					bz2y = p2.y - p1p3f*(p3.y - p1.y)/p1p3;
				}
				return "C"+(bz1x+","+bz1y+" "+bz2x+","+bz2y+" "+p2.x+","+p2.y);
			});
			return p.join(" ");
		},
		
		getLabel: function(/*Number*/number, /*Boolean*/fixed, /*Number*/precision){
			return sc.doIfLoaded("dojo/number", function(numberLib){
				return (fixed ? numberLib.format(number, {places : precision}) :
					numberLib.format(number)) || "";
			}, function(){
				return fixed ? number.toFixed(precision) : number.toString();
			});
		}
	});
});

},
'dojox/gfx/_base':function(){
define("dojox/gfx/_base", ["dojo/_base/lang", "dojo/_base/html", "dojo/_base/Color", "dojo/_base/sniff", "dojo/_base/window",
	    "dojo/_base/array","dojo/dom", "dojo/dom-construct","dojo/dom-geometry"], 
  function(lang, html, Color, has, win, arr, dom, domConstruct, domGeom){
	// module:
	//		dojox/gfx
	// summary:
	//		This module contains common core Graphics API used by different graphics renderers.
	var g = lang.getObject("dojox.gfx", true),
		b = g._base = {};
	/*===== g = dojox.gfx; b = dojox.gfx._base; =====*/
	
	// candidates for dojox.style (work on VML and SVG nodes)
	g._hasClass = function(/*DomNode*/node, /*String*/classStr){
		//	summary:
		//		Returns whether or not the specified classes are a portion of the
		//		class list currently applied to the node.
		// return (new RegExp('(^|\\s+)'+classStr+'(\\s+|$)')).test(node.className)	// Boolean
		var cls = node.getAttribute("className");
		return cls && (" " + cls + " ").indexOf(" " + classStr + " ") >= 0;  // Boolean
	};
	g._addClass = function(/*DomNode*/node, /*String*/classStr){
		//	summary:
		//		Adds the specified classes to the end of the class list on the
		//		passed node.
		var cls = node.getAttribute("className") || "";
		if(!cls || (" " + cls + " ").indexOf(" " + classStr + " ") < 0){
			node.setAttribute("className", cls + (cls ? " " : "") + classStr);
		}
	};
	g._removeClass = function(/*DomNode*/node, /*String*/classStr){
		//	summary: Removes classes from node.
		var cls = node.getAttribute("className");
		if(cls){
			node.setAttribute(
				"className",
				cls.replace(new RegExp('(^|\\s+)' + classStr + '(\\s+|$)'), "$1$2")
			);
		}
	};

	// candidate for dojox.html.metrics (dynamic font resize handler is not implemented here)

	//	derived from Morris John's emResized measurer
	b._getFontMeasurements = function(){
		//	summary:
		//		Returns an object that has pixel equivilents of standard font
		//		size values.
		var heights = {
			'1em': 0, '1ex': 0, '100%': 0, '12pt': 0, '16px': 0, 'xx-small': 0,
			'x-small': 0, 'small': 0, 'medium': 0, 'large': 0, 'x-large': 0,
			'xx-large': 0
		};
		var p;

		if(has("ie")){
			//	we do a font-size fix if and only if one isn't applied already.
			//	NOTE: If someone set the fontSize on the HTML Element, this will kill it.
			win.doc.documentElement.style.fontSize="100%";
		}

		//	set up the measuring node.
		var div = domConstruct.create("div", {style: {
				position: "absolute",
				left: "0",
				top: "-100px",
				width: "30px",
				height: "1000em",
				borderWidth: "0",
				margin: "0",
				padding: "0",
				outline: "none",
				lineHeight: "1",
				overflow: "hidden"
			}}, win.body());

		//	do the measurements.
		for(p in heights){
			div.style.fontSize = p;
			heights[p] = Math.round(div.offsetHeight * 12/16) * 16/12 / 1000;
		}

		win.body().removeChild(div);
		return heights; //object
	};

	var fontMeasurements = null;

	b._getCachedFontMeasurements = function(recalculate){
		if(recalculate || !fontMeasurements){
			fontMeasurements = b._getFontMeasurements();
		}
		return fontMeasurements;
	};

	// candidate for dojox.html.metrics

	var measuringNode = null, empty = {};
	b._getTextBox = function(	/*String*/ text,
								/*Object*/ style,
								/*String?*/ className){
		var m, s, al = arguments.length;
		var i;
		if(!measuringNode){
			measuringNode = domConstruct.create("div", {style: {
				position: "absolute",
				top: "-10000px",
				left: "0"
			}}, win.body());
		}
		m = measuringNode;
		// reset styles
		m.className = "";
		s = m.style;
		s.borderWidth = "0";
		s.margin = "0";
		s.padding = "0";
		s.outline = "0";
		// set new style
		if(al > 1 && style){
			for(i in style){
				if(i in empty){ continue; }
				s[i] = style[i];
			}
		}
		// set classes
		if(al > 2 && className){
			m.className = className;
		}
		// take a measure
		m.innerHTML = text;

		if(m["getBoundingClientRect"]){
			var bcr = m.getBoundingClientRect();
			return {l: bcr.left, t: bcr.top, w: bcr.width || (bcr.right - bcr.left), h: bcr.height || (bcr.bottom - bcr.top)};
		}else{
			return domGeom.getMarginBox(m);
		}
	};

	// candidate for dojo.dom

	var uniqueId = 0;
	b._getUniqueId = function(){
		// summary: returns a unique string for use with any DOM element
		var id;
		do{
			id = dojo._scopeName + "xUnique" + (++uniqueId);
		}while(dom.byId(id));
		return id;
	};

	lang.mixin(g, {
		//	summary:
		//		defines constants, prototypes, and utility functions for the core Graphics API

		// default shapes, which are used to fill in missing parameters
		defaultPath: {
			//	summary:
			//		Defines the default Path prototype object.
			type: "path", 
			//	type: String
			//		Specifies this object is a Path, default value 'path'.
			path: ""
			//	path: String
			//		The path commands. See W32C SVG 1.0 specification. 
			//		Defaults to empty string value.
		},
		defaultPolyline: {
			//	summary:
			//		Defines the default PolyLine prototype.
			type: "polyline", 
			//	type: String
			//		Specifies this object is a PolyLine, default value 'polyline'.
			points: []
			//	points: Array
			//		An array of point objects [{x:0,y:0},...] defining the default polyline's line segments. Value is an empty array [].
		},
		defaultRect: {
			//	summary:
			//		Defines the default Rect prototype.
			type: "rect",
			//	type: String
			//		Specifies this default object is a type of Rect. Value is 'rect' 
			x: 0, 
			//	x: Number
			//		The X coordinate of the default rectangles position, value 0.
			y: 0, 
			//	y: Number
			//		The Y coordinate of the default rectangle's position, value 0.
			width: 100, 
			//	width: Number
			//		The width of the default rectangle, value 100.
			height: 100, 
			//	height: Number
			//		The height of the default rectangle, value 100.
			r: 0
			//	r: Number
			//		The corner radius for the default rectangle, value 0.
		},
		defaultEllipse: {
			//	summary:
			//		Defines the default Ellipse prototype.
			type: "ellipse", 
			//	type: String
			//		Specifies that this object is a type of Ellipse, value is 'ellipse'
			cx: 0, 
			//	cx: Number
			//		The X coordinate of the center of the ellipse, default value 0.
			cy: 0, 
			//	cy: Number
			//		The Y coordinate of the center of the ellipse, default value 0.
			rx: 200,
			//	rx: Number
			//		The radius of the ellipse in the X direction, default value 200.
			ry: 100
			//	ry: Number
			//		The radius of the ellipse in the Y direction, default value 200.
		},
		defaultCircle: {
			//	summary:
			//		An object defining the default Circle prototype.
			type: "circle", 
			//	type: String
			//		Specifies this object is a circle, value 'circle'
			cx: 0, 
			//	cx: Number
			//		The X coordinate of the center of the circle, default value 0.
			cy: 0, 
			//	cy: Number
			//		The Y coordinate of the center of the circle, default value 0.
			r: 100
			//	r: Number
			//		The radius, default value 100.
		},
		defaultLine: {
			//	summary:
			//		An pbject defining the default Line prototype.
			type: "line", 
			//	type: String
			//		Specifies this is a Line, value 'line'
			x1: 0, 
			//	x1: Number
			//		The X coordinate of the start of the line, default value 0.
			y1: 0, 
			//	y1: Number
			//		The Y coordinate of the start of the line, default value 0.
			x2: 100,
			//	x2: Number
			//		The X coordinate of the end of the line, default value 100.
			y2: 100
			//	y2: Number
			//		The Y coordinate of the end of the line, default value 100.
		},
		defaultImage: {
			//	summary:
			//		Defines the default Image prototype.
			type: "image",
			//	type: String
			//		Specifies this object is an image, value 'image'.
			x: 0, 
			//	x: Number
			//		The X coordinate of the image's position, default value 0.
			y: 0, 
			//	y: Number
			//		The Y coordinate of the image's position, default value 0.
			width: 0,
			//	width: Number
			//		The width of the image, default value 0.
			height: 0,
			//	height:Number
			//		The height of the image, default value 0.
			src: ""
			//	src: String
			//		The src url of the image, defaults to empty string.
		},
		defaultText: {
			//	summary:
			//		Defines the default Text prototype.
			type: "text", 
			//	type: String
			//		Specifies this is a Text shape, value 'text'.
			x: 0, 
			//	x: Number
			//		The X coordinate of the text position, default value 0.
			y: 0, 
			//	y: Number
			//		The Y coordinate of the text position, default value 0.
			text: "",
			//	text: String
			//		The text to be displayed, default value empty string.
			align: "start",
			//	align:	String
			//		The horizontal text alignment, one of 'start', 'end', 'center'. Default value 'start'.
			decoration: "none",
			//	decoration: String
			//		The text decoration , one of 'none', ... . Default value 'none'.
			rotated: false,
			//	rotated: Boolean
			//		Whether the text is rotated, boolean default value false.
			kerning: true
			//	kerning: Boolean
			//		Whether kerning is used on the text, boolean default value true.
		},
		defaultTextPath: {
			//	summary:
			//		Defines the default TextPath prototype.
			type: "textpath", 
			//	type: String
			//		Specifies this is a TextPath, value 'textpath'.
			text: "", 
			//	text: String
			//		The text to be displayed, default value empty string.
			align: "start",
			//	align: String
			//		The horizontal text alignment, one of 'start', 'end', 'center'. Default value 'start'.
			decoration: "none",
			//	decoration: String
			//		The text decoration , one of 'none', ... . Default value 'none'.
			rotated: false,
			//	rotated: Boolean
			//		Whether the text is rotated, boolean default value false.
			kerning: true
			//	kerning: Boolean
			//		Whether kerning is used on the text, boolean default value true.
		},

		// default stylistic attributes
		defaultStroke: {
			//	summary:
			//		A stroke defines stylistic properties that are used when drawing a path.  
			//		This object defines the default Stroke prototype.
			type: "stroke", 
			//	type: String
			//		Specifies this object is a type of Stroke, value 'stroke'.
			color: "black", 
			//	color: String
			//		The color of the stroke, default value 'black'.
			style: "solid",
			//	style: String
			//		The style of the stroke, one of 'solid', ... . Default value 'solid'.
			width: 1,
			//	width: Number
			//		The width of a stroke, default value 1.
			cap: "butt",
			//	cap: String
			//		The endcap style of the path. One of 'butt', 'round', ... . Default value 'butt'.
			join: 4
			//	join: Number
			//		The join style to use when combining path segments. Default value 4.
		},
		defaultLinearGradient: {
			//	summary:
			//		An object defining the default stylistic properties used for Linear Gradient fills.
			//		Linear gradients are drawn along a virtual line, which results in appearance of a rotated pattern in a given direction/orientation.
			type: "linear", 
			//	type: String
			//		Specifies this object is a Linear Gradient, value 'linear'
			x1: 0, 
			//	x1: Number
			//		The X coordinate of the start of the virtual line along which the gradient is drawn, default value 0.
			y1: 0, 
			//	y1: Number
			//		The Y coordinate of the start of the virtual line along which the gradient is drawn, default value 0.
			x2: 100,
			//	x2: Number
			//		The X coordinate of the end of the virtual line along which the gradient is drawn, default value 100.
			y2: 100,
			//	y2: Number
			//		The Y coordinate of the end of the virtual line along which the gradient is drawn, default value 100.
			colors: [
				{ offset: 0, color: "black" }, { offset: 1, color: "white" }
			]
			//	colors: Array
			//		An array of colors at given offsets (from the start of the line).  The start of the line is
			//		defined at offest 0 with the end of the line at offset 1.
			//		Default value, [{ offset: 0, color: 'black'},{offset: 1, color: 'white'}], is a gradient from black to white. 
		},
		defaultRadialGradient: {
			// summary:
			//		An object specifying the default properties for RadialGradients using in fills patterns.
			type: "radial",
			//	type: String
			//		Specifies this is a RadialGradient, value 'radial'
			cx: 0, 
			//	cx: Number
			//		The X coordinate of the center of the radial gradient, default value 0.
			cy: 0, 
			//	cy: Number
			//		The Y coordinate of the center of the radial gradient, default value 0.
			r: 100,
			//	r: Number
			//		The radius to the end of the radial gradient, default value 100.
			colors: [
				{ offset: 0, color: "black" }, { offset: 1, color: "white" }
			]
			//	colors: Array
			//		An array of colors at given offsets (from the center of the radial gradient).  
			//		The center is defined at offest 0 with the outer edge of the gradient at offset 1.
			//		Default value, [{ offset: 0, color: 'black'},{offset: 1, color: 'white'}], is a gradient from black to white. 
		},
		defaultPattern: {
			// summary:
			//		An object specifying the default properties for a Pattern using in fill operations.
			type: "pattern", 
			// type: String
			//		Specifies this object is a Pattern, value 'pattern'.
			x: 0, 
			//	x: Number
			//		The X coordinate of the position of the pattern, default value is 0.
			y: 0, 
			//	y: Number
			//		The Y coordinate of the position of the pattern, default value is 0.
			width: 0, 
			//	width: Number
			//		The width of the pattern image, default value is 0.
			height: 0, 
			//	height: Number
			//		The height of the pattern image, default value is 0.
			src: ""
			//	src: String
			//		A url specifing the image to use for the pattern.
		},
		defaultFont: {
			// summary:
			//		An object specifying the default properties for a Font used in text operations.
			type: "font", 
			// type: String
			//		Specifies this object is a Font, value 'font'.
			style: "normal", 
			//	style: String
			//		The font style, one of 'normal', 'bold', default value 'normal'.
			variant: "normal",
			//	variant: String
			//		The font variant, one of 'normal', ... , default value 'normal'.
			weight: "normal", 
			//	weight: String
			//		The font weight, one of 'normal', ..., default value 'normal'.
			size: "10pt", 
			//	size: String
			//		The font size (including units), default value '10pt'.
			family: "serif"
			//	family: String
			//		The font family, one of 'serif', 'sanserif', ..., default value 'serif'.
		},

		getDefault: (function(){
			//	summary:
			//		Returns a function used to access default memoized prototype objects (see them defined above).
			var typeCtorCache = {};
			// a memoized delegate()
			return function(/*String*/ type){
				var t = typeCtorCache[type];
				if(t){
					return new t();
				}
				t = typeCtorCache[type] = new Function();
				t.prototype = g[ "default" + type ];
				return new t();
			}
		})(),

		normalizeColor: function(/*dojo.Color|Array|string|Object*/ color){
			//	summary:
			//		converts any legal color representation to normalized
			//		dojo.Color object
			return (color instanceof Color) ? color : new Color(color); // dojo.Color
		},
		normalizeParameters: function(existed, update){
			//	summary:
			//		updates an existing object with properties from an 'update'
			//		object
			//	existed: Object
			//		the target object to be updated
			//	update:  Object
			//		the 'update' object, whose properties will be used to update
			//		the existed object
			var x;
			if(update){
				var empty = {};
				for(x in existed){
					if(x in update && !(x in empty)){
						existed[x] = update[x];
					}
				}
			}
			return existed;	// Object
		},
		makeParameters: function(defaults, update){
			//	summary:
			//		copies the original object, and all copied properties from the
			//		'update' object
			//	defaults: Object
			//		the object to be cloned before updating
			//	update:   Object
			//		the object, which properties are to be cloned during updating
			var i = null;
			if(!update){
				// return dojo.clone(defaults);
				return lang.delegate(defaults);
			}
			var result = {};
			for(i in defaults){
				if(!(i in result)){
					result[i] = lang.clone((i in update) ? update[i] : defaults[i]);
				}
			}
			return result; // Object
		},
		formatNumber: function(x, addSpace){
			// summary: converts a number to a string using a fixed notation
			// x: Number
			//		number to be converted
			// addSpace: Boolean
			//		whether to add a space before a positive number
			var val = x.toString();
			if(val.indexOf("e") >= 0){
				val = x.toFixed(4);
			}else{
				var point = val.indexOf(".");
				if(point >= 0 && val.length - point > 5){
					val = x.toFixed(4);
				}
			}
			if(x < 0){
				return val; // String
			}
			return addSpace ? " " + val : val; // String
		},
		// font operations
		makeFontString: function(font){
			// summary: converts a font object to a CSS font string
			// font:	Object:	font object (see dojox.gfx.defaultFont)
			return font.style + " " + font.variant + " " + font.weight + " " + font.size + " " + font.family; // Object
		},
		splitFontString: function(str){
			// summary:
			//		converts a CSS font string to a font object
			// description:
			//		Converts a CSS font string to a gfx font object. The CSS font
			//		string components should follow the W3C specified order
			//		(see http://www.w3.org/TR/CSS2/fonts.html#font-shorthand):
			//		style, variant, weight, size, optional line height (will be
			//		ignored), and family.
			// str: String
			//		a CSS font string
			var font = g.getDefault("Font");
			var t = str.split(/\s+/);
			do{
				if(t.length < 5){ break; }
				font.style   = t[0];
				font.variant = t[1];
				font.weight  = t[2];
				var i = t[3].indexOf("/");
				font.size = i < 0 ? t[3] : t[3].substring(0, i);
				var j = 4;
				if(i < 0){
					if(t[4] == "/"){
						j = 6;
					}else if(t[4].charAt(0) == "/"){
						j = 5;
					}
				}
				if(j < t.length){
					font.family = t.slice(j).join(" ");
				}
			}while(false);
			return font;	// Object
		},
		// length operations
		cm_in_pt: 72 / 2.54, 
			//	cm_in_pt: Number
			//		points per centimeter (constant)
		mm_in_pt: 7.2 / 2.54,
			//	mm_in_pt: Number
			//		points per millimeter (constant)
		px_in_pt: function(){
			//	summary: returns the current number of pixels per point.
			return g._base._getCachedFontMeasurements()["12pt"] / 12;	// Number
		},
		pt2px: function(len){
			//	summary: converts points to pixels
			//	len: Number
			//		a value in points
			return len * g.px_in_pt();	// Number
		},
		px2pt: function(len){
			//	summary: converts pixels to points
			//	len: Number
			//		a value in pixels
			return len / g.px_in_pt();	// Number
		},
		normalizedLength: function(len) {
			//	summary: converts any length value to pixels
			//	len: String
			//		a length, e.g., '12pc'
			if(len.length === 0){ return 0; }
			if(len.length > 2){
				var px_in_pt = g.px_in_pt();
				var val = parseFloat(len);
				switch(len.slice(-2)){
					case "px": return val;
					case "pt": return val * px_in_pt;
					case "in": return val * 72 * px_in_pt;
					case "pc": return val * 12 * px_in_pt;
					case "mm": return val * g.mm_in_pt * px_in_pt;
					case "cm": return val * g.cm_in_pt * px_in_pt;
				}
			}
			return parseFloat(len);	// Number
		},

		pathVmlRegExp: /([A-Za-z]+)|(\d+(\.\d+)?)|(\.\d+)|(-\d+(\.\d+)?)|(-\.\d+)/g,
			//	pathVmlRegExp: RegExp
			//		a constant regular expression used to split a SVG/VML path into primitive components
		pathSvgRegExp: /([A-Za-z])|(\d+(\.\d+)?)|(\.\d+)|(-\d+(\.\d+)?)|(-\.\d+)/g,
			//	pathVmlRegExp: RegExp
			//		a constant regular expression used to split a SVG/VML path into primitive components

		equalSources: function(a /*Object*/, b /*Object*/){
			//	summary: compares event sources, returns true if they are equal
			//	a: first event source
			//	b: event source to compare against a
			return a && b && a === b;
		},

		switchTo: function(renderer/*String|Object*/){
			//	summary: switch the graphics implementation to the specified renderer.
			//	renderer: 
			//		Either the string name of a renderer (eg. 'canvas', 'svg, ...) or the renderer
			//		object to switch to.
			var ns = typeof renderer == "string" ? g[renderer] : renderer;
			if(ns){
				arr.forEach(["Group", "Rect", "Ellipse", "Circle", "Line",
						"Polyline", "Image", "Text", "Path", "TextPath",
						"Surface", "createSurface", "fixTarget"], function(name){
					g[name] = ns[name];
				});
			}
		}
	});
	return g; // defaults object api
});

},
'dojo/query':function(){
define(["./_base/kernel", "./has", "./dom", "./on", "./_base/array", "./_base/lang", "./selector/_loader", "./selector/_loader!default"],
	function(dojo, has, dom, on, array, lang, loader, defaultEngine){
"use strict";

	has.add("array-extensible", function(){
		// test to see if we can extend an array (not supported in old IE)
		return lang.delegate([], {length: 1}).length == 1 && !has("bug-for-in-skips-shadowed");
	});
	
	var ap = Array.prototype, aps = ap.slice, apc = ap.concat, forEach = array.forEach;

	var tnl = function(/*Array*/ a, /*dojo.NodeList?*/ parent, /*Function?*/ NodeListCtor){
		// summary:
		//		decorate an array to make it look like a `dojo.NodeList`.
		// a:
		//		Array of nodes to decorate.
		// parent:
		//		An optional parent NodeList that generated the current
		//		list of nodes. Used to call _stash() so the parent NodeList
		//		can be accessed via end() later.
		// NodeListCtor:
		//		An optional constructor function to use for any
		//		new NodeList calls. This allows a certain chain of
		//		NodeList calls to use a different object than dojo.NodeList.
		var nodeList = new (NodeListCtor || this._NodeListCtor || nl)(a);
		return parent ? nodeList._stash(parent) : nodeList;
	};

	var loopBody = function(f, a, o){
		a = [0].concat(aps.call(a, 0));
		o = o || dojo.global;
		return function(node){
			a[0] = node;
			return f.apply(o, a);
		};
	};

	// adapters

	var adaptAsForEach = function(f, o){
		// summary:
		//		adapts a single node function to be used in the forEach-type
		//		actions. The initial object is returned from the specialized
		//		function.
		// f: Function
		//		a function to adapt
		// o: Object?
		//		an optional context for f
		return function(){
			this.forEach(loopBody(f, arguments, o));
			return this;	// Object
		};
	};

	var adaptAsMap = function(f, o){
		// summary:
		//		adapts a single node function to be used in the map-type
		//		actions. The return is a new array of values, as via `dojo.map`
		// f: Function
		//		a function to adapt
		// o: Object?
		//		an optional context for f
		return function(){
			return this.map(loopBody(f, arguments, o));
		};
	};

	var adaptAsFilter = function(f, o){
		// summary:
		//		adapts a single node function to be used in the filter-type actions
		// f: Function
		//		a function to adapt
		// o: Object?
		//		an optional context for f
		return function(){
			return this.filter(loopBody(f, arguments, o));
		};
	};

	var adaptWithCondition = function(f, g, o){
		// summary:
		//		adapts a single node function to be used in the map-type
		//		actions, behaves like forEach() or map() depending on arguments
		// f: Function
		//		a function to adapt
		// g: Function
		//		a condition function, if true runs as map(), otherwise runs as forEach()
		// o: Object?
		//		an optional context for f and g
		return function(){
			var a = arguments, body = loopBody(f, a, o);
			if(g.call(o || dojo.global, a)){
				return this.map(body);	// self
			}
			this.forEach(body);
			return this;	// self
		};
	};

	var NodeList = function(array){
		// summary:
		//		dojo.NodeList is an of Array-like object which adds syntactic
		//		sugar for chaining, common iteration operations, animation, and
		//		node manipulation. NodeLists are most often returned as the
		//		result of dojo.query() calls.
		// description:
		//		dojo.NodeList instances provide many utilities that reflect
		//		core Dojo APIs for Array iteration and manipulation, DOM
		//		manipulation, and event handling. Instead of needing to dig up
		//		functions in the dojo.* namespace, NodeLists generally make the
		//		full power of Dojo available for DOM manipulation tasks in a
		//		simple, chainable way.
		// example:
		//		create a node list from a node
		//		|	new dojo.NodeList(dojo.byId("foo"));
		// example:
		//		get a NodeList from a CSS query and iterate on it
		//		|	var l = dojo.query(".thinger");
		//		|	l.forEach(function(node, index, nodeList){
		//		|		console.log(index, node.innerHTML);
		//		|	});
		// example:
		//		use native and Dojo-provided array methods to manipulate a
		//		NodeList without needing to use dojo.* functions explicitly:
		//		|	var l = dojo.query(".thinger");
		//		|	// since NodeLists are real arrays, they have a length
		//		|	// property that is both readable and writable and
		//		|	// push/pop/shift/unshift methods
		//		|	console.log(l.length);
		//		|	l.push(dojo.create("span"));
		//		|
		//		|	// dojo's normalized array methods work too:
		//		|	console.log( l.indexOf(dojo.byId("foo")) );
		//		|	// ...including the special "function as string" shorthand
		//		|	console.log( l.every("item.nodeType == 1") );
		//		|
		//		|	// NodeLists can be [..] indexed, or you can use the at()
		//		|	// function to get specific items wrapped in a new NodeList:
		//		|	var node = l[3]; // the 4th element
		//		|	var newList = l.at(1, 3); // the 2nd and 4th elements
		// example:
		//		the style functions you expect are all there too:
		//		|	// style() as a getter...
		//		|	var borders = dojo.query(".thinger").style("border");
		//		|	// ...and as a setter:
		//		|	dojo.query(".thinger").style("border", "1px solid black");
		//		|	// class manipulation
		//		|	dojo.query("li:nth-child(even)").addClass("even");
		//		|	// even getting the coordinates of all the items
		//		|	var coords = dojo.query(".thinger").coords();
		// example:
		//		DOM manipulation functions from the dojo.* namespace area also
		//		available:
		//		|	// remove all of the elements in the list from their
		//		|	// parents (akin to "deleting" them from the document)
		//		|	dojo.query(".thinger").orphan();
		//		|	// place all elements in the list at the front of #foo
		//		|	dojo.query(".thinger").place("foo", "first");
		// example:
		//		Event handling couldn't be easier. `dojo.connect` is mapped in,
		//		and shortcut handlers are provided for most DOM events:
		//		|	// like dojo.connect(), but with implicit scope
		//		|	dojo.query("li").connect("onclick", console, "log");
		//		|
		//		|	// many common event handlers are already available directly:
		//		|	dojo.query("li").onclick(console, "log");
		//		|	var toggleHovered = dojo.hitch(dojo, "toggleClass", "hovered");
		//		|	dojo.query("p")
		//		|		.onmouseenter(toggleHovered)
		//		|		.onmouseleave(toggleHovered);
		// example:
		//		chainability is a key advantage of NodeLists:
		//		|	dojo.query(".thinger")
		//		|		.onclick(function(e){ /* ... */ })
		//		|		.at(1, 3, 8) // get a subset
		//		|			.style("padding", "5px")
		//		|			.forEach(console.log);
		var isNew = this instanceof nl && has("array-extensible");
		if(typeof array == "number"){
			array = Array(array);
		}
		var nodeArray = (array && "length" in array) ? array : arguments;
		if(isNew || !nodeArray.sort){
			// make sure it's a real array before we pass it on to be wrapped 
			var target = isNew ? this : [],
				l = target.length = nodeArray.length;
			for(var i = 0; i < l; i++){
				target[i] = nodeArray[i];
			}
			if(isNew){
				// called with new operator, this means we are going to use this instance and push
				// the nodes on to it. This is usually much faster since the NodeList properties
				//	don't need to be copied (unless the list of nodes is extremely large).
				return target;
			}
			nodeArray = target;
		}
		// called without new operator, use a real array and copy prototype properties,
		// this is slower and exists for back-compat. Should be removed in 2.0.
		lang._mixin(nodeArray, nlp);
		nodeArray._NodeListCtor = function(array){
			// call without new operator to preserve back-compat behavior
			return nl(array);
		};
		return nodeArray;
	};
	
	var nl = NodeList, nlp = nl.prototype = 
		has("array-extensible") ? [] : {};// extend an array if it is extensible

	// expose adapters and the wrapper as private functions

	nl._wrap = nlp._wrap = tnl;
	nl._adaptAsMap = adaptAsMap;
	nl._adaptAsForEach = adaptAsForEach;
	nl._adaptAsFilter  = adaptAsFilter;
	nl._adaptWithCondition = adaptWithCondition;

	// mass assignment

	// add array redirectors
	forEach(["slice", "splice"], function(name){
		var f = ap[name];
		//Use a copy of the this array via this.slice() to allow .end() to work right in the splice case.
		// CANNOT apply ._stash()/end() to splice since it currently modifies
		// the existing this array -- it would break backward compatibility if we copy the array before
		// the splice so that we can use .end(). So only doing the stash option to this._wrap for slice.
		nlp[name] = function(){ return this._wrap(f.apply(this, arguments), name == "slice" ? this : null); };
	});
	// concat should be here but some browsers with native NodeList have problems with it

	// add array.js redirectors
	forEach(["indexOf", "lastIndexOf", "every", "some"], function(name){
		var f = array[name];
		nlp[name] = function(){ return f.apply(dojo, [this].concat(aps.call(arguments, 0))); };
	});

	/*===== var NodeList = dojo.NodeList; =====*/
	lang.extend(NodeList, {
		// copy the constructors
		constructor: nl,
		_NodeListCtor: nl,
		toString: function(){
			// Array.prototype.toString can't be applied to objects, so we use join
			return this.join(",");
		},
		_stash: function(parent){
			// summary:
			//		private function to hold to a parent NodeList. end() to return the parent NodeList.
			//
			// example:
			// How to make a `dojo.NodeList` method that only returns the third node in
			// the dojo.NodeList but allows access to the original NodeList by using this._stash:
			//	|	dojo.extend(dojo.NodeList, {
			//	|		third: function(){
			//	|			var newNodeList = dojo.NodeList(this[2]);
			//	|			return newNodeList._stash(this);
			//	|		}
			//	|	});
			//	|	// then see how _stash applies a sub-list, to be .end()'ed out of
			//	|	dojo.query(".foo")
			//	|		.third()
			//	|			.addClass("thirdFoo")
			//	|		.end()
			//	|		// access to the orig .foo list
			//	|		.removeClass("foo")
			//	|
			//
			this._parent = parent;
			return this; //dojo.NodeList
		},

		on: function(eventName, listener){
			// summary:
			//		Listen for events on the nodes in the NodeList. Basic usage is:
			//		| query(".my-class").on("click", listener);
			// 		This supports event delegation by using selectors as the first argument with the event names as
			//		pseudo selectors. For example:
			//		| dojo.query("#my-list").on("li:click", listener);
			//		This will listen for click events within <li> elements that are inside the #my-list element.
			//		Because on supports CSS selector syntax, we can use comma-delimited events as well:
			//		| dojo.query("#my-list").on("li button:mouseover, li:click", listener);
			var handles = this.map(function(node){
				return on(node, eventName, listener); // TODO: apply to the NodeList so the same selector engine is used for matches
			});
			handles.remove = function(){
				for(var i = 0; i < handles.length; i++){
					handles[i].remove();
				}
			};
			return handles;
		},

		end: function(){
			// summary:
			//		Ends use of the current `dojo.NodeList` by returning the previous dojo.NodeList
			//		that generated the current dojo.NodeList.
			// description:
			//		Returns the `dojo.NodeList` that generated the current `dojo.NodeList`. If there
			//		is no parent dojo.NodeList, an empty dojo.NodeList is returned.
			// example:
			//	|	dojo.query("a")
			//	|		.filter(".disabled")
			//	|			// operate on the anchors that only have a disabled class
			//	|			.style("color", "grey")
			//	|		.end()
			//	|		// jump back to the list of anchors
			//	|		.style(...)
			//
			if(this._parent){
				return this._parent;
			}else{
				//Just return empty list.
				return new this._NodeListCtor(0);
			}
		},

		// http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array#Methods

		// FIXME: handle return values for #3244
		//		http://trac.dojotoolkit.org/ticket/3244

		// FIXME:
		//		need to wrap or implement:
		//			join (perhaps w/ innerHTML/outerHTML overload for toString() of items?)
		//			reduce
		//			reduceRight

		/*=====
		slice: function(begin, end){
			// summary:
			//		Returns a new NodeList, maintaining this one in place
			// description:
			//		This method behaves exactly like the Array.slice method
			//		with the caveat that it returns a dojo.NodeList and not a
			//		raw Array. For more details, see Mozilla's (slice
			//		documentation)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:slice]
			// begin: Integer
			//		Can be a positive or negative integer, with positive
			//		integers noting the offset to begin at, and negative
			//		integers denoting an offset from the end (i.e., to the left
			//		of the end)
			// end: Integer?
			//		Optional parameter to describe what position relative to
			//		the NodeList's zero index to end the slice at. Like begin,
			//		can be positive or negative.
			return this._wrap(a.slice.apply(this, arguments));
		},

		splice: function(index, howmany, item){
			// summary:
			//		Returns a new NodeList, manipulating this NodeList based on
			//		the arguments passed, potentially splicing in new elements
			//		at an offset, optionally deleting elements
			// description:
			//		This method behaves exactly like the Array.splice method
			//		with the caveat that it returns a dojo.NodeList and not a
			//		raw Array. For more details, see Mozilla's (splice
			//		documentation)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:splice]
			//		For backwards compatibility, calling .end() on the spliced NodeList
			//		does not return the original NodeList -- splice alters the NodeList in place.
			// index: Integer
			//		begin can be a positive or negative integer, with positive
			//		integers noting the offset to begin at, and negative
			//		integers denoting an offset from the end (i.e., to the left
			//		of the end)
			// howmany: Integer?
			//		Optional parameter to describe what position relative to
			//		the NodeList's zero index to end the slice at. Like begin,
			//		can be positive or negative.
			// item: Object...?
			//		Any number of optional parameters may be passed in to be
			//		spliced into the NodeList
			// returns:
			//		dojo.NodeList
			return this._wrap(a.splice.apply(this, arguments));
		},

		indexOf: function(value, fromIndex){
			// summary:
			//		see dojo.indexOf(). The primary difference is that the acted-on
			//		array is implicitly this NodeList
			// value: Object:
			//		The value to search for.
			// fromIndex: Integer?:
			//		The location to start searching from. Optional. Defaults to 0.
			// description:
			//		For more details on the behavior of indexOf, see Mozilla's
			//		(indexOf
			//		docs)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:indexOf]
			// returns:
			//		Positive Integer or 0 for a match, -1 of not found.
			return d.indexOf(this, value, fromIndex); // Integer
		},

		lastIndexOf: function(value, fromIndex){
			// summary:
			//		see dojo.lastIndexOf(). The primary difference is that the
			//		acted-on array is implicitly this NodeList
			// description:
			//		For more details on the behavior of lastIndexOf, see
			//		Mozilla's (lastIndexOf
			//		docs)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:lastIndexOf]
			// value: Object
			//		The value to search for.
			// fromIndex: Integer?
			//		The location to start searching from. Optional. Defaults to 0.
			// returns:
			//		Positive Integer or 0 for a match, -1 of not found.
			return d.lastIndexOf(this, value, fromIndex); // Integer
		},

		every: function(callback, thisObject){
			// summary:
			//		see `dojo.every()` and the (Array.every
			//		docs)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:every].
			//		Takes the same structure of arguments and returns as
			//		dojo.every() with the caveat that the passed array is
			//		implicitly this NodeList
			// callback: Function: the callback
			// thisObject: Object?: the context
			return d.every(this, callback, thisObject); // Boolean
		},

		some: function(callback, thisObject){
			// summary:
			//		Takes the same structure of arguments and returns as
			//		`dojo.some()` with the caveat that the passed array is
			//		implicitly this NodeList.  See `dojo.some()` and Mozilla's
			//		(Array.some
			//		documentation)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:some].
			// callback: Function: the callback
			// thisObject: Object?: the context
			return d.some(this, callback, thisObject); // Boolean
		},
		=====*/

		concat: function(item){
			// summary:
			//		Returns a new NodeList comprised of items in this NodeList
			//		as well as items passed in as parameters
			// description:
			//		This method behaves exactly like the Array.concat method
			//		with the caveat that it returns a `dojo.NodeList` and not a
			//		raw Array. For more details, see the (Array.concat
			//		docs)[http://developer.mozilla.org/en/docs/Core_JavaScript_1.5_Reference:Global_Objects:Array:concat]
			// item: Object?
			//		Any number of optional parameters may be passed in to be
			//		spliced into the NodeList
			// returns:
			//		dojo.NodeList

			//return this._wrap(apc.apply(this, arguments));
			// the line above won't work for the native NodeList :-(

			// implementation notes:
			// 1) Native NodeList is not an array, and cannot be used directly
			// in concat() --- the latter doesn't recognize it as an array, and
			// does not inline it, but append as a single entity.
			// 2) On some browsers (e.g., Safari) the "constructor" property is
			// read-only and cannot be changed. So we have to test for both
			// native NodeList and dojo.NodeList in this property to recognize
			// the node list.

			var t = lang.isArray(this) ? this : aps.call(this, 0),
				m = array.map(arguments, function(a){
					return a && !lang.isArray(a) &&
						(typeof NodeList != "undefined" && a.constructor === NodeList || a.constructor === this._NodeListCtor) ?
							aps.call(a, 0) : a;
				});
			return this._wrap(apc.apply(t, m), this);	// dojo.NodeList
		},

		map: function(/*Function*/ func, /*Function?*/ obj){
			// summary:
			//		see dojo.map(). The primary difference is that the acted-on
			//		array is implicitly this NodeList and the return is a
			//		dojo.NodeList (a subclass of Array)
			///return d.map(this, func, obj, d.NodeList); // dojo.NodeList
			return this._wrap(array.map(this, func, obj), this); // dojo.NodeList
		},

		forEach: function(callback, thisObj){
			// summary:
			//		see `dojo.forEach()`. The primary difference is that the acted-on
			//		array is implicitly this NodeList. If you want the option to break out
			//		of the forEach loop, use every() or some() instead.
			forEach(this, callback, thisObj);
			// non-standard return to allow easier chaining
			return this; // dojo.NodeList
		},
		filter: function(/*String|Function*/ filter){
			// summary:
			//		"masks" the built-in javascript filter() method (supported
			//		in Dojo via `dojo.filter`) to support passing a simple
			//		string filter in addition to supporting filtering function
			//		objects.
			// filter:
			//		If a string, a CSS rule like ".thinger" or "div > span".
			// example:
			//		"regular" JS filter syntax as exposed in dojo.filter:
			//		|	dojo.query("*").filter(function(item){
			//		|		// highlight every paragraph
			//		|		return (item.nodeName == "p");
			//		|	}).style("backgroundColor", "yellow");
			// example:
			//		the same filtering using a CSS selector
			//		|	dojo.query("*").filter("p").styles("backgroundColor", "yellow");

			var a = arguments, items = this, start = 0;
			if(typeof filter == "string"){ // inline'd type check
				items = query._filterResult(this, a[0]);
				if(a.length == 1){
					// if we only got a string query, pass back the filtered results
					return items._stash(this); // dojo.NodeList
				}
				// if we got a callback, run it over the filtered items
				start = 1;
			}
			return this._wrap(array.filter(items, a[start], a[start + 1]), this);	// dojo.NodeList
		},
		instantiate: function(/*String|Object*/ declaredClass, /*Object?*/ properties){
			// summary:
			//		Create a new instance of a specified class, using the
			//		specified properties and each node in the nodeList as a
			//		srcNodeRef.
			// example:
			//		Grabs all buttons in the page and converts them to diji.form.Buttons.
			//	|	var buttons = dojo.query("button").instantiate("dijit.form.Button", {showLabel: true});
			var c = lang.isFunction(declaredClass) ? declaredClass : lang.getObject(declaredClass);
			properties = properties || {};
			return this.forEach(function(node){
				new c(properties, node);
			});	// dojo.NodeList
		},
		at: function(/*===== index =====*/){
			// summary:
			//		Returns a new NodeList comprised of items in this NodeList
			//		at the given index or indices.
			//
			// index: Integer...
			//		One or more 0-based indices of items in the current
			//		NodeList. A negative index will start at the end of the
			//		list and go backwards.
			//
			// example:
			//	Shorten the list to the first, second, and third elements
			//	|	dojo.query("a").at(0, 1, 2).forEach(fn);
			//
			// example:
			//	Retrieve the first and last elements of a unordered list:
			//	|	dojo.query("ul > li").at(0, -1).forEach(cb);
			//
			// example:
			//	Do something for the first element only, but end() out back to
			//	the original list and continue chaining:
			//	|	dojo.query("a").at(0).onclick(fn).end().forEach(function(n){
			//	|		console.log(n); // all anchors on the page.
			//	|	})
			//
			// returns:
			//		dojo.NodeList
			var t = new this._NodeListCtor(0);
			forEach(arguments, function(i){
				if(i < 0){ i = this.length + i; }
				if(this[i]){ t.push(this[i]); }
			}, this);
			return t._stash(this); // dojo.NodeList
		}
	});


/*===== 
dojo.query = function(selector, context){
	// summary:
	//		This modules provides DOM querying functionality. The module export is a function
	//		that can be used to query for DOM nodes by CSS selector and returns a dojo.NodeList
	//		representing the matching nodes.
	//
	// selector: String
	//		A CSS selector to search for.
	// context: String|DomNode?
	//		An optional context to limit the searching scope. Only nodes under `context` will be 
	//		scanned. 
	// 
	//	example:
	//		add an onclick handler to every submit button in the document
	//		which causes the form to be sent via Ajax instead:
	//	|	define(["dojo/query"], function(query){
	// 	|	query("input[type='submit']").on("click", function(e){
	//	|		dojo.stopEvent(e); // prevent sending the form
	//	|		var btn = e.target;
	//	|		dojo.xhrPost({
	//	|			form: btn.form,
	//	|			load: function(data){
	//	|				// replace the form with the response
	//	|				var div = dojo.doc.createElement("div");
	//	|				dojo.place(div, btn.form, "after");
	//	|				div.innerHTML = data;
	//	|				dojo.style(btn.form, "display", "none");
	//	|			}
	//	|		});
	//	|	}); 
	//
	// description:
	//		dojo/query is responsible for loading the appropriate query engine and wrapping 
	//		its results with a `dojo.NodeList`. You can use dojo/query with a specific selector engine
	//		by using it as a plugin. For example, if you installed the sizzle package, you could
	//		use it as the selector engine with:
	//		|	define("dojo/query!sizzle", function(query){
	//		|		query("div")...
	//
	//		The id after the ! can be a module id of the selector engine or one of the following values:
	//		|	+ acme: This is the default engine used by Dojo base, and will ensure that the full
	//		|	Acme engine is always loaded. 
	//		|	
	//		|	+ css2: If the browser has a native selector engine, this will be used, otherwise a
	//		|	very minimal lightweight selector engine will be loaded that can do simple CSS2 selectors
	//		|	(by #id, .class, tag, and [name=value] attributes, with standard child or descendant (>)
	//		|	operators) and nothing more.
	//		|
	//		|	+ css2.1: If the browser has a native selector engine, this will be used, otherwise the
	//		|	full Acme engine will be loaded. 
	//		|	
	//		|	+ css3: If the browser has a native selector engine with support for CSS3 pseudo
	//		|	selectors (most modern browsers except IE8), this will be used, otherwise the
	//		|	full Acme engine will be loaded.
	//		|	
	//		|	+ Or the module id of a selector engine can be used to explicitly choose the selector engine
	//		
	//		For example, if you are using CSS3 pseudo selectors in module, you can specify that
	//		you will need support them with:
	//		|	define("dojo/query!css3", function(query){
	//		|		query('#t > h3:nth-child(odd)')...
	//
	//		You can also choose the selector engine/load configuration by setting the <FIXME:what is the configuration setting?>.
	//		For example:
	//		|	<script data-dojo-config="query-selector:'css3'" src="dojo.js"></script>
	//		
	return new dojo.NodeList(); // dojo.NodeList
};
=====*/

function queryForEngine(engine, NodeList){
	var query = function(/*String*/ query, /*String|DOMNode?*/ root){
		//	summary:
		//		Returns nodes which match the given CSS selector, searching the
		//		entire document by default but optionally taking a node to scope
		//		the search by. Returns an instance of dojo.NodeList.
		if(typeof root == "string"){
			root = dom.byId(root);
			if(!root){
				return new NodeList([]);
			}
		}
		var results = typeof query == "string" ? engine(query, root) : query.orphan ? query : [query];
		if(results.orphan){
			// already wrapped
			return results; 
		}
		return new NodeList(results);
	};
	query.matches = engine.match || function(node, selector, root){
		// summary:
		//		Test to see if a node matches a selector
		return query.filter([node], selector, root).length > 0;
	};
	// the engine provides a filtering function, use it to for matching
	query.filter = engine.filter || function(nodes, selector, root){
		// summary:
		//		Filters an array of nodes. Note that this does not guarantee to return a dojo.NodeList, just an array.
		return query(selector, root).filter(function(node){
			return array.indexOf(nodes, node) > -1;
		});
	};
	if(typeof engine != "function"){
		var search = engine.search;
		engine = function(selector, root){
			// Slick does it backwards (or everyone else does it backwards, probably the latter)
			return search(root || document, selector);
		};
	}
	return query;
}
var query = queryForEngine(defaultEngine, NodeList);
// the query that is returned from this module is slightly different than dojo.query,
// because dojo.query has to maintain backwards compatibility with returning a
// true array which has performance problems. The query returned from the module
// does not use true arrays, but rather inherits from Array, making it much faster to
// instantiate.
dojo.query = queryForEngine(defaultEngine, function(array){
	// call it without the new operator to invoke the back-compat behavior that returns a true array
	return NodeList(array);
});

query.load = /*===== dojo.query.load= ======*/ function(id, parentRequire, loaded, config){
	// summary: can be used as AMD plugin to conditionally load new query engine
	// example:
	//	|	define(["dojo/query!custom"], function(qsa){ 
	//	|		// loaded selector/custom.js as engine
	//	|		qsa("#foobar").forEach(...);
	//	|	});
	loader.load(id, parentRequire, function(engine){
		loaded(queryForEngine(engine, NodeList));
	});
};

dojo._filterQueryResult = query._filterResult = function(nodes, selector, root){
	return new NodeList(query.filter(nodes, selector, root));
};
dojo.NodeList = query.NodeList = NodeList;
return query;
});

},
'dojo/dom-class':function(){
define(["./_base/lang", "./_base/array", "./dom"], function(lang, array, dom){
	// module:
	//		dojo/dom-class
	// summary:
	//		This module defines the core dojo DOM class API.

	var className = "className";

	/* Part I of classList-based implementation is preserved here for posterity
	var classList = "classList";
	has.add("dom-classList", function(){
		return classList in document.createElement("p");
	});
	*/

	// =============================
	// (CSS) Class Functions
	// =============================

	/*=====
	dojo.hasClass = function(node, classStr){
		// summary:
		//		Returns whether or not the specified classes are a portion of the
		//		class list currently applied to the node.
		//
		// node: String|DOMNode
		//		String ID or DomNode reference to check the class for.
		//
		// classStr: String
		//		A string class name to look for.
		//
		// returns: Boolean
		//
		// example:
		//		Do something if a node with id="someNode" has class="aSillyClassName" present
		//	|	if(dojo.hasClass("someNode","aSillyClassName")){ ... }
	};
	=====*/

	/*=====
	dojo.addClass = function(node, classStr){
		// summary:
		//		Adds the specified classes to the end of the class list on the
		//		passed node. Will not re-apply duplicate classes.
		//
		// node: String|DOMNode
		//		String ID or DomNode reference to add a class string too
		//
		// classStr: String|Array
		//		A String class name to add, or several space-separated class names,
		//		or an array of class names.
		//
		// example:
		//		Add a class to some node:
		//	|	dojo.addClass("someNode", "anewClass");
		//
		// example:
		//		Add two classes at once:
		//	|	dojo.addClass("someNode", "firstClass secondClass");
		//
		// example:
		//		Add two classes at once (using array):
		//	|	dojo.addClass("someNode", ["firstClass", "secondClass"]);
		//
		// example:
		//		Available in `dojo.NodeList` for multiple additions
		//	|	dojo.query("ul > li").addClass("firstLevel");
	};
	=====*/

	/*=====
	dojo.removeClass = function(node, classStr){
		// summary:
		//		Removes the specified classes from node. No `dojo.hasClass`
		//		check is required.
		//
		// node: String|DOMNode
		//		String ID or DomNode reference to remove the class from.
		//
		// classStr: String|Array
		//		An optional String class name to remove, or several space-separated
		//		class names, or an array of class names. If omitted, all class names
		//		will be deleted.
		//
		// example:
		//		Remove a class from some node:
		//	|	dojo.removeClass("someNode", "firstClass");
		//
		// example:
		//		Remove two classes from some node:
		//	|	dojo.removeClass("someNode", "firstClass secondClass");
		//
		// example:
		//		Remove two classes from some node (using array):
		//	|	dojo.removeClass("someNode", ["firstClass", "secondClass"]);
		//
		// example:
		//		Remove all classes from some node:
		//	|	dojo.removeClass("someNode");
		//
		// example:
		//		Available in `dojo.NodeList()` for multiple removal
		//	|	dojo.query(".foo").removeClass("foo");
	};
	=====*/

	/*=====
	dojo.replaceClass = function(node, addClassStr, removeClassStr){
		// summary:
		//		Replaces one or more classes on a node if not present.
		//		Operates more quickly than calling dojo.removeClass and dojo.addClass
		//
		// node: String|DOMNode
		//		String ID or DomNode reference to remove the class from.
		//
		// addClassStr: String|Array
		//		A String class name to add, or several space-separated class names,
		//		or an array of class names.
		//
		// removeClassStr: String|Array?
		//		A String class name to remove, or several space-separated class names,
		//		or an array of class names.
		//
		// example:
		//	|	dojo.replaceClass("someNode", "add1 add2", "remove1 remove2");
		//
		// example:
		//	Replace all classes with addMe
		//	|	dojo.replaceClass("someNode", "addMe");
		//
		// example:
		//	Available in `dojo.NodeList()` for multiple toggles
		//	|	dojo.query(".findMe").replaceClass("addMe", "removeMe");
	};
	=====*/

	/*=====
	dojo.toggleClass = function(node, classStr, condition){
		// summary:
		//		Adds a class to node if not present, or removes if present.
		//		Pass a boolean condition if you want to explicitly add or remove.
		//      Returns the condition that was specified directly or indirectly.
		//
		// node: String|DOMNode
		//		String ID or DomNode reference to toggle a class string
		//
		// classStr: String|Array
		//		A String class name to toggle, or several space-separated class names,
		//		or an array of class names.
		//
		// condition:
		//		If passed, true means to add the class, false means to remove.
		//      Otherwise dojo.hasClass(node, classStr) is used to detect the class presence.
		//
		// example:
		//	|	dojo.toggleClass("someNode", "hovered");
		//
		// example:
		//		Forcefully add a class
		//	|	dojo.toggleClass("someNode", "hovered", true);
		//
		// example:
		//		Available in `dojo.NodeList()` for multiple toggles
		//	|	dojo.query(".toggleMe").toggleClass("toggleMe");
	};
	=====*/

	var cls, // exports object
		spaces = /\s+/, a1 = [""];

	function str2array(s){
		if(typeof s == "string" || s instanceof String){
			if(s && !spaces.test(s)){
				a1[0] = s;
				return a1;
			}
			var a = s.split(spaces);
			if(a.length && !a[0]){
				a.shift();
			}
			if(a.length && !a[a.length - 1]){
				a.pop();
			}
			return a;
		}
		// assumed to be an array
		if(!s){
			return [];
		}
		return array.filter(s, function(x){ return x; });
	}

	/* Part II of classList-based implementation is preserved here for posterity
	if(has("dom-classList")){
		// new classList version
		cls = {
			contains: function containsClass(node, classStr){
				var clslst = classStr && dom.byId(node)[classList];
				return clslst && clslst.contains(classStr); // Boolean
			},

			add: function addClass(node, classStr){
				node = dom.byId(node);
				classStr = str2array(classStr);
				for(var i = 0, len = classStr.length; i < len; ++i){
					node[classList].add(classStr[i]);
				}
			},

			remove: function removeClass(node, classStr){
				node = dom.byId(node);
				if(classStr === undefined){
					node[className] = "";
				}else{
					classStr = str2array(classStr);
					for(var i = 0, len = classStr.length; i < len; ++i){
						node[classList].remove(classStr[i]);
					}
				}
			},

			replace: function replaceClass(node, addClassStr, removeClassStr){
				node = dom.byId(node);
				if(removeClassStr === undefined){
					node[className] = "";
				}else{
					removeClassStr = str2array(removeClassStr);
					for(var i = 0, len = removeClassStr.length; i < len; ++i){
						node[classList].remove(removeClassStr[i]);
					}
				}
				addClassStr = str2array(addClassStr);
				for(i = 0, len = addClassStr.length; i < len; ++i){
					node[classList].add(addClassStr[i]);
				}
			},

			toggle: function toggleClass(node, classStr, condition){
				node = dom.byId(node);
				if(condition === undefined){
					classStr = str2array(classStr);
					for(var i = 0, len = classStr.length; i < len; ++i){
						node[classList].toggle(classStr[i]);
					}
				}else{
					cls[condition ? "add" : "remove"](node, classStr);
				}
				return condition;   // Boolean
			}
		}
	}
	*/

	// regular DOM version
	var fakeNode = {};  // for effective replacement
	cls = {
		contains: function containsClass(/*DomNode|String*/node, /*String*/classStr){
			return ((" " + dom.byId(node)[className] + " ").indexOf(" " + classStr + " ") >= 0); // Boolean
		},

		add: function addClass(/*DomNode|String*/node, /*String|Array*/classStr){
			node = dom.byId(node);
			classStr = str2array(classStr);
			var cls = node[className], oldLen;
			cls = cls ? " " + cls + " " : " ";
			oldLen = cls.length;
			for(var i = 0, len = classStr.length, c; i < len; ++i){
				c = classStr[i];
				if(c && cls.indexOf(" " + c + " ") < 0){
					cls += c + " ";
				}
			}
			if(oldLen < cls.length){
				node[className] = cls.substr(1, cls.length - 2);
			}
		},

		remove: function removeClass(/*DomNode|String*/node, /*String|Array?*/classStr){
			node = dom.byId(node);
			var cls;
			if(classStr !== undefined){
				classStr = str2array(classStr);
				cls = " " + node[className] + " ";
				for(var i = 0, len = classStr.length; i < len; ++i){
					cls = cls.replace(" " + classStr[i] + " ", " ");
				}
				cls = lang.trim(cls);
			}else{
				cls = "";
			}
			if(node[className] != cls){ node[className] = cls; }
		},

		replace: function replaceClass(/*DomNode|String*/node, /*String|Array*/addClassStr, /*String|Array?*/removeClassStr){
			node = dom.byId(node);
			fakeNode[className] = node[className];
			cls.remove(fakeNode, removeClassStr);
			cls.add(fakeNode, addClassStr);
			if(node[className] !== fakeNode[className]){
				node[className] = fakeNode[className];
			}
		},

		toggle: function toggleClass(/*DomNode|String*/node, /*String|Array*/classStr, /*Boolean?*/condition){
			node = dom.byId(node);
			if(condition === undefined){
				classStr = str2array(classStr);
				for(var i = 0, len = classStr.length, c; i < len; ++i){
					c = classStr[i];
					cls[cls.contains(node, c) ? "remove" : "add"](node, c);
				}
			}else{
				cls[condition ? "add" : "remove"](node, classStr);
			}
			return condition;   // Boolean
		}
	};

	return cls;
});

},
'dojo/dom-attr':function(){
define(["exports", "./_base/sniff", "./_base/lang", "./dom", "./dom-style", "./dom-prop"],
		function(exports, has, lang, dom, style, prop){
	// module:
	//		dojo/dom-attr
	// summary:
	//		This module defines the core dojo DOM attributes API.

	// =============================
	// Element attribute Functions
	// =============================

	// This module will be obsolete soon. Use dojo.prop instead.

	// dojo.attr() should conform to http://www.w3.org/TR/DOM-Level-2-Core/

	// attribute-related functions (to be obsolete soon)

	/*=====
	dojo.hasAttr = function(node, name){
		// summary:
		//		Returns true if the requested attribute is specified on the
		//		given element, and false otherwise.
		// node: DOMNode|String
		//		id or reference to the element to check
		// name: String
		//		the name of the attribute
		// returns: Boolean
		//		true if the requested attribute is specified on the
		//		given element, and false otherwise
	};
	=====*/

	/*=====
	dojo.getAttr = function(node, name){
		// summary:
		//		Gets an attribute on an HTML element.
		// description:
		//		Handles normalized getting of attributes on DOM Nodes.
		// node: DOMNode|String
		//		id or reference to the element to get the attribute on
		// name: String
		//		the name of the attribute to get.
		// returns:
		//		the value of the requested attribute or null if that attribute does not have a specified or
		//		default value;
		//
		// example:
		//	|	// get the current value of the "foo" attribute on a node
		//	|	dojo.getAttr(dojo.byId("nodeId"), "foo");
		//	|	// or we can just pass the id:
		//	|	dojo.getAttr("nodeId", "foo");
	};
	=====*/

	/*=====
	dojo.setAttr = function(node, name, value){
		// summary:
		//		Sets an attribute on an HTML element.
		// description:
		//		Handles normalized setting of attributes on DOM Nodes.
		//
		//		When passing functions as values, note that they will not be
		//		directly assigned to slots on the node, but rather the default
		//		behavior will be removed and the new behavior will be added
		//		using `dojo.connect()`, meaning that event handler properties
		//		will be normalized and that some caveats with regards to
		//		non-standard behaviors for onsubmit apply. Namely that you
		//		should cancel form submission using `dojo.stopEvent()` on the
		//		passed event object instead of returning a boolean value from
		//		the handler itself.
		// node: DOMNode|String
		//		id or reference to the element to set the attribute on
		// name: String|Object
		//		the name of the attribute to set, or a hash of key-value pairs to set.
		// value: String?
		//		the value to set for the attribute, if the name is a string.
		// returns:
		//		the DOM node
		//
		// example:
		//	|	// use attr() to set the tab index
		//	|	dojo.setAttr("nodeId", "tabIndex", 3);
		//
		// example:
		//	Set multiple values at once, including event handlers:
		//	|	dojo.setAttr("formId", {
		//	|		"foo": "bar",
		//	|		"tabIndex": -1,
		//	|		"method": "POST",
		//	|		"onsubmit": function(e){
		//	|			// stop submitting the form. Note that the IE behavior
		//	|			// of returning true or false will have no effect here
		//	|			// since our handler is connect()ed to the built-in
		//	|			// onsubmit behavior and so we need to use
		//	|			// dojo.stopEvent() to ensure that the submission
		//	|			// doesn't proceed.
		//	|			dojo.stopEvent(e);
		//	|
		//	|			// submit the form with Ajax
		//	|			dojo.xhrPost({ form: "formId" });
		//	|		}
		//	|	});
		//
		// example:
		//	Style is s special case: Only set with an object hash of styles
		//	|	dojo.setAttr("someNode",{
		//	|		id:"bar",
		//	|		style:{
		//	|			width:"200px", height:"100px", color:"#000"
		//	|		}
		//	|	});
		//
		// example:
		//	Again, only set style as an object hash of styles:
		//	|	var obj = { color:"#fff", backgroundColor:"#000" };
		//	|	dojo.setAttr("someNode", "style", obj);
		//	|
		//	|	// though shorter to use `dojo.style()` in this case:
		//	|	dojo.setStyle("someNode", obj);
	};
	=====*/

	/*=====
	dojo.removeAttr = function(node, name){
		// summary:
		//		Removes an attribute from an HTML element.
		// node: DOMNode|String
		//		id or reference to the element to remove the attribute from
		// name: String
		//		the name of the attribute to remove
	};
	=====*/

	/*=====
	dojo.getNodeProp = function(node, name){
		// summary:
		//		Returns an effective value of a property or an attribute.
		// node: DOMNode|String
		//		id or reference to the element to remove the attribute from
		// name: String
		//		the name of the attribute
		// returns:
		//      the value of the attribute
	};
	=====*/

	var forcePropNames = {
			innerHTML:	1,
			className:	1,
			htmlFor:	has("ie"),
			value:		1
		},
		attrNames = {
			// original attribute names
			classname: "class",
			htmlfor: "for",
			// for IE
			tabindex: "tabIndex",
			readonly: "readOnly"
		};

	function _hasAttr(node, name){
		var attr = node.getAttributeNode && node.getAttributeNode(name);
		return attr && attr.specified; // Boolean
	}

	// There is a difference in the presence of certain properties and their default values
	// between browsers. For example, on IE "disabled" is present on all elements,
	// but it is value is "false"; "tabIndex" of <div> returns 0 by default on IE, yet other browsers
	// can return -1.

	exports.has = function hasAttr(/*DOMNode|String*/node, /*String*/name){
		var lc = name.toLowerCase();
		return forcePropNames[prop.names[lc] || name] || _hasAttr(dom.byId(node), attrNames[lc] || name);	// Boolean
	};

	exports.get = function getAttr(/*DOMNode|String*/node, /*String*/name){
		node = dom.byId(node);
		var lc = name.toLowerCase(),
			propName = prop.names[lc] || name,
			forceProp = forcePropNames[propName];
		// should we access this attribute via a property or via getAttribute()?
		value = node[propName];
		if(forceProp && typeof value != "undefined"){
			// node's property
			return value;	// Anything
		}
		if(propName != "href" && (typeof value == "boolean" || lang.isFunction(value))){
			// node's property
			return value;	// Anything
		}
		// node's attribute
		// we need _hasAttr() here to guard against IE returning a default value
		var attrName = attrNames[lc] || name;
		return _hasAttr(node, attrName) ? node.getAttribute(attrName) : null; // Anything
	};

	exports.set = function setAttr(/*DOMNode|String*/node, /*String|Object*/name, /*String?*/value){
		node = dom.byId(node);
		if(arguments.length == 2){ // inline'd type check
			// the object form of setter: the 2nd argument is a dictionary
			for(var x in name){
				exports.set(node, x, name[x]);
			}
			return node; // DomNode
		}
		var lc = name.toLowerCase(),
			propName = prop.names[lc] || name,
			forceProp = forcePropNames[propName];
		if(propName == "style" && typeof value != "string"){ // inline'd type check
			// special case: setting a style
			style.set(node, value);
			return node; // DomNode
		}
		if(forceProp || typeof value == "boolean" || lang.isFunction(value)){
			return prop.set(node, name, value)
		}
		// node's attribute
		node.setAttribute(attrNames[lc] || name, value);
		return node; // DomNode
	};

	exports.remove = function removeAttr(/*DOMNode|String*/ node, /*String*/ name){
		dom.byId(node).removeAttribute(attrNames[name.toLowerCase()] || name);
	};

	exports.getNodeProp = function getNodeProp(/*DomNode|String*/ node, /*String*/ name){
		node = dom.byId(node);
		var lc = name.toLowerCase(), propName = prop.names[lc] || name;
		if((propName in node) && propName != "href"){
			// node's property
			return node[propName];	// Anything
		}
		// node's attribute
		var attrName = attrNames[lc] || name;
		return _hasAttr(node, attrName) ? node.getAttribute(attrName) : null; // Anything
	};
});

},
'dojo/selector/acme':function(){
define(["../_base/kernel", "../has", "../dom", "../_base/sniff", "../_base/array", "../_base/lang", "../_base/window"], function(dojo, has, dom){
  //  module:
  //    dojo/selector/acme
  //  summary:
  //    This module defines the Acme selector engine

/*
	acme architectural overview:

		acme is a relatively full-featured CSS3 query library. It is
		designed to take any valid CSS3 selector and return the nodes matching
		the selector. To do this quickly, it processes queries in several
		steps, applying caching where profitable.

		The steps (roughly in reverse order of the way they appear in the code):
			1.) check to see if we already have a "query dispatcher"
				- if so, use that with the given parameterization. Skip to step 4.
			2.) attempt to determine which branch to dispatch the query to:
				- JS (optimized DOM iteration)
				- native (FF3.1+, Safari 3.1+, IE 8+)
			3.) tokenize and convert to executable "query dispatcher"
				- this is where the lion's share of the complexity in the
					system lies. In the DOM version, the query dispatcher is
					assembled as a chain of "yes/no" test functions pertaining to
					a section of a simple query statement (".blah:nth-child(odd)"
					but not "div div", which is 2 simple statements). Individual
					statement dispatchers are cached (to prevent re-definition)
					as are entire dispatch chains (to make re-execution of the
					same query fast)
			4.) the resulting query dispatcher is called in the passed scope
					(by default the top-level document)
				- for DOM queries, this results in a recursive, top-down
					evaluation of nodes based on each simple query section
				- for native implementations, this may mean working around spec
					bugs. So be it.
			5.) matched nodes are pruned to ensure they are unique (if necessary)
*/


	////////////////////////////////////////////////////////////////////////
	// Toolkit aliases
	////////////////////////////////////////////////////////////////////////

	// if you are extracting acme for use in your own system, you will
	// need to provide these methods and properties. No other porting should be
	// necessary, save for configuring the system to use a class other than
	// dojo.NodeList as the return instance instantiator
	var trim = 			dojo.trim;
	var each = 			dojo.forEach;
	// 					d.isIE; // float
	// 					d.isSafari; // float
	// 					d.isOpera; // float
	// 					d.isWebKit; // float
	// 					d.doc ; // document element

	var getDoc = function(){ return dojo.doc; };
	// NOTE(alex): the spec is idiotic. CSS queries should ALWAYS be case-sensitive, but nooooooo
	var cssCaseBug = ((dojo.isWebKit||dojo.isMozilla) && ((getDoc().compatMode) == "BackCompat"));

	////////////////////////////////////////////////////////////////////////
	// Global utilities
	////////////////////////////////////////////////////////////////////////


	var specials = ">~+";

	// global thunk to determine whether we should treat the current query as
	// case sensitive or not. This switch is flipped by the query evaluator
	// based on the document passed as the context to search.
	var caseSensitive = false;

	// how high?
	var yesman = function(){ return true; };

	////////////////////////////////////////////////////////////////////////
	// Tokenizer
	////////////////////////////////////////////////////////////////////////

	var getQueryParts = function(query){
		//	summary:
		//		state machine for query tokenization
		//	description:
		//		instead of using a brittle and slow regex-based CSS parser,
		//		acme implements an AST-style query representation. This
		//		representation is only generated once per query. For example,
		//		the same query run multiple times or under different root nodes
		//		does not re-parse the selector expression but instead uses the
		//		cached data structure. The state machine implemented here
		//		terminates on the last " " (space) character and returns an
		//		ordered array of query component structures (or "parts"). Each
		//		part represents an operator or a simple CSS filtering
		//		expression. The structure for parts is documented in the code
		//		below.


		// NOTE:
		//		this code is designed to run fast and compress well. Sacrifices
		//		to readability and maintainability have been made.  Your best
		//		bet when hacking the tokenizer is to put The Donnas on *really*
		//		loud (may we recommend their "Spend The Night" release?) and
		//		just assume you're gonna make mistakes. Keep the unit tests
		//		open and run them frequently. Knowing is half the battle ;-)
		if(specials.indexOf(query.slice(-1)) >= 0){
			// if we end with a ">", "+", or "~", that means we're implicitly
			// searching all children, so make it explicit
			query += " * "
		}else{
			// if you have not provided a terminator, one will be provided for
			// you...
			query += " ";
		}

		var ts = function(/*Integer*/ s, /*Integer*/ e){
			// trim and slice.

			// take an index to start a string slice from and an end position
			// and return a trimmed copy of that sub-string
			return trim(query.slice(s, e));
		};

		// the overall data graph of the full query, as represented by queryPart objects
		var queryParts = [];


		// state keeping vars
		var inBrackets = -1, inParens = -1, inMatchFor = -1,
			inPseudo = -1, inClass = -1, inId = -1, inTag = -1,
			lc = "", cc = "", pStart;

		// iteration vars
		var x = 0, // index in the query
			ql = query.length,
			currentPart = null, // data structure representing the entire clause
			_cp = null; // the current pseudo or attr matcher

		// several temporary variables are assigned to this structure during a
		// potential sub-expression match:
		//		attr:
		//			a string representing the current full attribute match in a
		//			bracket expression
		//		type:
		//			if there's an operator in a bracket expression, this is
		//			used to keep track of it
		//		value:
		//			the internals of parenthetical expression for a pseudo. for
		//			:nth-child(2n+1), value might be "2n+1"

		var endTag = function(){
			// called when the tokenizer hits the end of a particular tag name.
			// Re-sets state variables for tag matching and sets up the matcher
			// to handle the next type of token (tag or operator).
			if(inTag >= 0){
				var tv = (inTag == x) ? null : ts(inTag, x); // .toLowerCase();
				currentPart[ (specials.indexOf(tv) < 0) ? "tag" : "oper" ] = tv;
				inTag = -1;
			}
		};

		var endId = function(){
			// called when the tokenizer might be at the end of an ID portion of a match
			if(inId >= 0){
				currentPart.id = ts(inId, x).replace(/\\/g, "");
				inId = -1;
			}
		};

		var endClass = function(){
			// called when the tokenizer might be at the end of a class name
			// match. CSS allows for multiple classes, so we augment the
			// current item with another class in its list
			if(inClass >= 0){
				currentPart.classes.push(ts(inClass + 1, x).replace(/\\/g, ""));
				inClass = -1;
			}
		};

		var endAll = function(){
			// at the end of a simple fragment, so wall off the matches
			endId();
			endTag();
			endClass();
		};

		var endPart = function(){
			endAll();
			if(inPseudo >= 0){
				currentPart.pseudos.push({ name: ts(inPseudo + 1, x) });
			}
			// hint to the selector engine to tell it whether or not it
			// needs to do any iteration. Many simple selectors don't, and
			// we can avoid significant construction-time work by advising
			// the system to skip them
			currentPart.loops = (
					currentPart.pseudos.length ||
					currentPart.attrs.length ||
					currentPart.classes.length	);

			currentPart.oquery = currentPart.query = ts(pStart, x); // save the full expression as a string


			// otag/tag are hints to suggest to the system whether or not
			// it's an operator or a tag. We save a copy of otag since the
			// tag name is cast to upper-case in regular HTML matches. The
			// system has a global switch to figure out if the current
			// expression needs to be case sensitive or not and it will use
			// otag or tag accordingly
			currentPart.otag = currentPart.tag = (currentPart["oper"]) ? null : (currentPart.tag || "*");

			if(currentPart.tag){
				// if we're in a case-insensitive HTML doc, we likely want
				// the toUpperCase when matching on element.tagName. If we
				// do it here, we can skip the string op per node
				// comparison
				currentPart.tag = currentPart.tag.toUpperCase();
			}

			// add the part to the list
			if(queryParts.length && (queryParts[queryParts.length-1].oper)){
				// operators are always infix, so we remove them from the
				// list and attach them to the next match. The evaluator is
				// responsible for sorting out how to handle them.
				currentPart.infixOper = queryParts.pop();
				currentPart.query = currentPart.infixOper.query + " " + currentPart.query;
				/*
				console.debug(	"swapping out the infix",
								currentPart.infixOper,
								"and attaching it to",
								currentPart);
				*/
			}
			queryParts.push(currentPart);

			currentPart = null;
		};

		// iterate over the query, character by character, building up a
		// list of query part objects
		for(; lc=cc, cc=query.charAt(x), x < ql; x++){
			//		cc: the current character in the match
			//		lc: the last character (if any)

			// someone is trying to escape something, so don't try to match any
			// fragments. We assume we're inside a literal.
			if(lc == "\\"){ continue; }
			if(!currentPart){ // a part was just ended or none has yet been created
				// NOTE: I hate all this alloc, but it's shorter than writing tons of if's
				pStart = x;
				//	rules describe full CSS sub-expressions, like:
				//		#someId
				//		.className:first-child
				//	but not:
				//		thinger > div.howdy[type=thinger]
				//	the indidual components of the previous query would be
				//	split into 3 parts that would be represented a structure
				//	like:
				//		[
				//			{
				//				query: "thinger",
				//				tag: "thinger",
				//			},
				//			{
				//				query: "div.howdy[type=thinger]",
				//				classes: ["howdy"],
				//				infixOper: {
				//					query: ">",
				//					oper: ">",
				//				}
				//			},
				//		]
				currentPart = {
					query: null, // the full text of the part's rule
					pseudos: [], // CSS supports multiple pseud-class matches in a single rule
					attrs: [],	// CSS supports multi-attribute match, so we need an array
					classes: [], // class matches may be additive, e.g.: .thinger.blah.howdy
					tag: null,	// only one tag...
					oper: null, // ...or operator per component. Note that these wind up being exclusive.
					id: null,	// the id component of a rule
					getTag: function(){
						return (caseSensitive) ? this.otag : this.tag;
					}
				};

				// if we don't have a part, we assume we're going to start at
				// the beginning of a match, which should be a tag name. This
				// might fault a little later on, but we detect that and this
				// iteration will still be fine.
				inTag = x;
			}

			if(inBrackets >= 0){
				// look for a the close first
				if(cc == "]"){ // if we're in a [...] clause and we end, do assignment
					if(!_cp.attr){
						// no attribute match was previously begun, so we
						// assume this is an attribute existence match in the
						// form of [someAttributeName]
						_cp.attr = ts(inBrackets+1, x);
					}else{
						// we had an attribute already, so we know that we're
						// matching some sort of value, as in [attrName=howdy]
						_cp.matchFor = ts((inMatchFor||inBrackets+1), x);
					}
					var cmf = _cp.matchFor;
					if(cmf){
						// try to strip quotes from the matchFor value. We want
						// [attrName=howdy] to match the same
						//	as [attrName = 'howdy' ]
						if(	(cmf.charAt(0) == '"') || (cmf.charAt(0) == "'") ){
							_cp.matchFor = cmf.slice(1, -1);
						}
					}
					// end the attribute by adding it to the list of attributes.
					currentPart.attrs.push(_cp);
					_cp = null; // necessary?
					inBrackets = inMatchFor = -1;
				}else if(cc == "="){
					// if the last char was an operator prefix, make sure we
					// record it along with the "=" operator.
					var addToCc = ("|~^$*".indexOf(lc) >=0 ) ? lc : "";
					_cp.type = addToCc+cc;
					_cp.attr = ts(inBrackets+1, x-addToCc.length);
					inMatchFor = x+1;
				}
				// now look for other clause parts
			}else if(inParens >= 0){
				// if we're in a parenthetical expression, we need to figure
				// out if it's attached to a pseudo-selector rule like
				// :nth-child(1)
				if(cc == ")"){
					if(inPseudo >= 0){
						_cp.value = ts(inParens+1, x);
					}
					inPseudo = inParens = -1;
				}
			}else if(cc == "#"){
				// start of an ID match
				endAll();
				inId = x+1;
			}else if(cc == "."){
				// start of a class match
				endAll();
				inClass = x;
			}else if(cc == ":"){
				// start of a pseudo-selector match
				endAll();
				inPseudo = x;
			}else if(cc == "["){
				// start of an attribute match.
				endAll();
				inBrackets = x;
				// provide a new structure for the attribute match to fill-in
				_cp = {
					/*=====
					attr: null, type: null, matchFor: null
					=====*/
				};
			}else if(cc == "("){
				// we really only care if we've entered a parenthetical
				// expression if we're already inside a pseudo-selector match
				if(inPseudo >= 0){
					// provide a new structure for the pseudo match to fill-in
					_cp = {
						name: ts(inPseudo+1, x),
						value: null
					};
					currentPart.pseudos.push(_cp);
				}
				inParens = x;
			}else if(
				(cc == " ") &&
				// if it's a space char and the last char is too, consume the
				// current one without doing more work
				(lc != cc)
			){
				endPart();
			}
		}
		return queryParts;
	};


	////////////////////////////////////////////////////////////////////////
	// DOM query infrastructure
	////////////////////////////////////////////////////////////////////////

	var agree = function(first, second){
		// the basic building block of the yes/no chaining system. agree(f1,
		// f2) generates a new function which returns the boolean results of
		// both of the passed functions to a single logical-anded result. If
		// either are not passed, the other is used exclusively.
		if(!first){ return second; }
		if(!second){ return first; }

		return function(){
			return first.apply(window, arguments) && second.apply(window, arguments);
		}
	};

	var getArr = function(i, arr){
		// helps us avoid array alloc when we don't need it
		var r = arr||[]; // FIXME: should this be 'new d._NodeListCtor()' ?
		if(i){ r.push(i); }
		return r;
	};

	var _isElement = function(n){ return (1 == n.nodeType); };

	// FIXME: need to coalesce _getAttr with defaultGetter
	var blank = "";
	var _getAttr = function(elem, attr){
		if(!elem){ return blank; }
		if(attr == "class"){
			return elem.className || blank;
		}
		if(attr == "for"){
			return elem.htmlFor || blank;
		}
		if(attr == "style"){
			return elem.style.cssText || blank;
		}
		return (caseSensitive ? elem.getAttribute(attr) : elem.getAttribute(attr, 2)) || blank;
	};

	var attrs = {
		"*=": function(attr, value){
			return function(elem){
				// E[foo*="bar"]
				//		an E element whose "foo" attribute value contains
				//		the substring "bar"
				return (_getAttr(elem, attr).indexOf(value)>=0);
			}
		},
		"^=": function(attr, value){
			// E[foo^="bar"]
			//		an E element whose "foo" attribute value begins exactly
			//		with the string "bar"
			return function(elem){
				return (_getAttr(elem, attr).indexOf(value)==0);
			}
		},
		"$=": function(attr, value){
			// E[foo$="bar"]
			//		an E element whose "foo" attribute value ends exactly
			//		with the string "bar"
			return function(elem){
				var ea = " "+_getAttr(elem, attr);
				return (ea.lastIndexOf(value)==(ea.length-value.length));
			}
		},
		"~=": function(attr, value){
			// E[foo~="bar"]
			//		an E element whose "foo" attribute value is a list of
			//		space-separated values, one of which is exactly equal
			//		to "bar"

			// return "[contains(concat(' ',@"+attr+",' '), ' "+ value +" ')]";
			var tval = " "+value+" ";
			return function(elem){
				var ea = " "+_getAttr(elem, attr)+" ";
				return (ea.indexOf(tval)>=0);
			}
		},
		"|=": function(attr, value){
			// E[hreflang|="en"]
			//		an E element whose "hreflang" attribute has a
			//		hyphen-separated list of values beginning (from the
			//		left) with "en"
			var valueDash = value+"-";
			return function(elem){
				var ea = _getAttr(elem, attr);
				return (
					(ea == value) ||
					(ea.indexOf(valueDash)==0)
				);
			}
		},
		"=": function(attr, value){
			return function(elem){
				return (_getAttr(elem, attr) == value);
			}
		}
	};

	// avoid testing for node type if we can. Defining this in the negative
	// here to avoid negation in the fast path.
	var _noNES = (typeof getDoc().firstChild.nextElementSibling == "undefined");
	var _ns = !_noNES ? "nextElementSibling" : "nextSibling";
	var _ps = !_noNES ? "previousElementSibling" : "previousSibling";
	var _simpleNodeTest = (_noNES ? _isElement : yesman);

	var _lookLeft = function(node){
		// look left
		while(node = node[_ps]){
			if(_simpleNodeTest(node)){ return false; }
		}
		return true;
	};

	var _lookRight = function(node){
		// look right
		while(node = node[_ns]){
			if(_simpleNodeTest(node)){ return false; }
		}
		return true;
	};

	var getNodeIndex = function(node){
		var root = node.parentNode;
		var i = 0,
			tret = root.children || root.childNodes,
			ci = (node["_i"]||-1),
			cl = (root["_l"]||-1);

		if(!tret){ return -1; }
		var l = tret.length;

		// we calculate the parent length as a cheap way to invalidate the
		// cache. It's not 100% accurate, but it's much more honest than what
		// other libraries do
		if( cl == l && ci >= 0 && cl >= 0 ){
			// if it's legit, tag and release
			return ci;
		}

		// else re-key things
		root["_l"] = l;
		ci = -1;
		for(var te = root["firstElementChild"]||root["firstChild"]; te; te = te[_ns]){
			if(_simpleNodeTest(te)){
				te["_i"] = ++i;
				if(node === te){
					// NOTE:
					//	shortcutting the return at this step in indexing works
					//	very well for benchmarking but we avoid it here since
					//	it leads to potential O(n^2) behavior in sequential
					//	getNodexIndex operations on a previously un-indexed
					//	parent. We may revisit this at a later time, but for
					//	now we just want to get the right answer more often
					//	than not.
					ci = i;
				}
			}
		}
		return ci;
	};

	var isEven = function(elem){
		return !((getNodeIndex(elem)) % 2);
	};

	var isOdd = function(elem){
		return ((getNodeIndex(elem)) % 2);
	};

	var pseudos = {
		"checked": function(name, condition){
			return function(elem){
				return !!("checked" in elem ? elem.checked : elem.selected);
			}
		},
		"first-child": function(){ return _lookLeft; },
		"last-child": function(){ return _lookRight; },
		"only-child": function(name, condition){
			return function(node){
				return _lookLeft(node) && _lookRight(node);
			};
		},
		"empty": function(name, condition){
			return function(elem){
				// DomQuery and jQuery get this wrong, oddly enough.
				// The CSS 3 selectors spec is pretty explicit about it, too.
				var cn = elem.childNodes;
				var cnl = elem.childNodes.length;
				// if(!cnl){ return true; }
				for(var x=cnl-1; x >= 0; x--){
					var nt = cn[x].nodeType;
					if((nt === 1)||(nt == 3)){ return false; }
				}
				return true;
			}
		},
		"contains": function(name, condition){
			var cz = condition.charAt(0);
			if( cz == '"' || cz == "'" ){ //remove quote
				condition = condition.slice(1, -1);
			}
			return function(elem){
				return (elem.innerHTML.indexOf(condition) >= 0);
			}
		},
		"not": function(name, condition){
			var p = getQueryParts(condition)[0];
			var ignores = { el: 1 };
			if(p.tag != "*"){
				ignores.tag = 1;
			}
			if(!p.classes.length){
				ignores.classes = 1;
			}
			var ntf = getSimpleFilterFunc(p, ignores);
			return function(elem){
				return (!ntf(elem));
			}
		},
		"nth-child": function(name, condition){
			var pi = parseInt;
			// avoid re-defining function objects if we can
			if(condition == "odd"){
				return isOdd;
			}else if(condition == "even"){
				return isEven;
			}
			// FIXME: can we shorten this?
			if(condition.indexOf("n") != -1){
				var tparts = condition.split("n", 2);
				var pred = tparts[0] ? ((tparts[0] == '-') ? -1 : pi(tparts[0])) : 1;
				var idx = tparts[1] ? pi(tparts[1]) : 0;
				var lb = 0, ub = -1;
				if(pred > 0){
					if(idx < 0){
						idx = (idx % pred) && (pred + (idx % pred));
					}else if(idx>0){
						if(idx >= pred){
							lb = idx - idx % pred;
						}
						idx = idx % pred;
					}
				}else if(pred<0){
					pred *= -1;
					// idx has to be greater than 0 when pred is negative;
					// shall we throw an error here?
					if(idx > 0){
						ub = idx;
						idx = idx % pred;
					}
				}
				if(pred > 0){
					return function(elem){
						var i = getNodeIndex(elem);
						return (i>=lb) && (ub<0 || i<=ub) && ((i % pred) == idx);
					}
				}else{
					condition = idx;
				}
			}
			var ncount = pi(condition);
			return function(elem){
				return (getNodeIndex(elem) == ncount);
			}
		}
	};

	var defaultGetter = (dojo.isIE && (dojo.isIE < 9 || dojo.isQuirks)) ? function(cond){
		var clc = cond.toLowerCase();
		if(clc == "class"){ cond = "className"; }
		return function(elem){
			return (caseSensitive ? elem.getAttribute(cond) : elem[cond]||elem[clc]);
		}
	} : function(cond){
		return function(elem){
			return (elem && elem.getAttribute && elem.hasAttribute(cond));
		}
	};

	var getSimpleFilterFunc = function(query, ignores){
		// generates a node tester function based on the passed query part. The
		// query part is one of the structures generated by the query parser
		// when it creates the query AST. The "ignores" object specifies which
		// (if any) tests to skip, allowing the system to avoid duplicating
		// work where it may have already been taken into account by other
		// factors such as how the nodes to test were fetched in the first
		// place
		if(!query){ return yesman; }
		ignores = ignores||{};

		var ff = null;

		if(!("el" in ignores)){
			ff = agree(ff, _isElement);
		}

		if(!("tag" in ignores)){
			if(query.tag != "*"){
				ff = agree(ff, function(elem){
					return (elem && (elem.tagName == query.getTag()));
				});
			}
		}

		if(!("classes" in ignores)){
			each(query.classes, function(cname, idx, arr){
				// get the class name
				/*
				var isWildcard = cname.charAt(cname.length-1) == "*";
				if(isWildcard){
					cname = cname.substr(0, cname.length-1);
				}
				// I dislike the regex thing, even if memoized in a cache, but it's VERY short
				var re = new RegExp("(?:^|\\s)" + cname + (isWildcard ? ".*" : "") + "(?:\\s|$)");
				*/
				var re = new RegExp("(?:^|\\s)" + cname + "(?:\\s|$)");
				ff = agree(ff, function(elem){
					return re.test(elem.className);
				});
				ff.count = idx;
			});
		}

		if(!("pseudos" in ignores)){
			each(query.pseudos, function(pseudo){
				var pn = pseudo.name;
				if(pseudos[pn]){
					ff = agree(ff, pseudos[pn](pn, pseudo.value));
				}
			});
		}

		if(!("attrs" in ignores)){
			each(query.attrs, function(attr){
				var matcher;
				var a = attr.attr;
				// type, attr, matchFor
				if(attr.type && attrs[attr.type]){
					matcher = attrs[attr.type](a, attr.matchFor);
				}else if(a.length){
					matcher = defaultGetter(a);
				}
				if(matcher){
					ff = agree(ff, matcher);
				}
			});
		}

		if(!("id" in ignores)){
			if(query.id){
				ff = agree(ff, function(elem){
					return (!!elem && (elem.id == query.id));
				});
			}
		}

		if(!ff){
			if(!("default" in ignores)){
				ff = yesman;
			}
		}
		return ff;
	};

	var _nextSibling = function(filterFunc){
		return function(node, ret, bag){
			while(node = node[_ns]){
				if(_noNES && (!_isElement(node))){ continue; }
				if(
					(!bag || _isUnique(node, bag)) &&
					filterFunc(node)
				){
					ret.push(node);
				}
				break;
			}
			return ret;
		}
	};

	var _nextSiblings = function(filterFunc){
		return function(root, ret, bag){
			var te = root[_ns];
			while(te){
				if(_simpleNodeTest(te)){
					if(bag && !_isUnique(te, bag)){
						break;
					}
					if(filterFunc(te)){
						ret.push(te);
					}
				}
				te = te[_ns];
			}
			return ret;
		}
	};

	// get an array of child *elements*, skipping text and comment nodes
	var _childElements = function(filterFunc){
		filterFunc = filterFunc||yesman;
		return function(root, ret, bag){
			// get an array of child elements, skipping text and comment nodes
			var te, x = 0, tret = root.children || root.childNodes;
			while(te = tret[x++]){
				if(
					_simpleNodeTest(te) &&
					(!bag || _isUnique(te, bag)) &&
					(filterFunc(te, x))
				){
					ret.push(te);
				}
			}
			return ret;
		};
	};

	/*
	// thanks, Dean!
	var itemIsAfterRoot = d.isIE ? function(item, root){
		return (item.sourceIndex > root.sourceIndex);
	} : function(item, root){
		return (item.compareDocumentPosition(root) == 2);
	};
	*/

	// test to see if node is below root
	var _isDescendant = function(node, root){
		var pn = node.parentNode;
		while(pn){
			if(pn == root){
				break;
			}
			pn = pn.parentNode;
		}
		return !!pn;
	};

	var _getElementsFuncCache = {};

	var getElementsFunc = function(query){
		var retFunc = _getElementsFuncCache[query.query];
		// if we've got a cached dispatcher, just use that
		if(retFunc){ return retFunc; }
		// else, generate a new on

		// NOTE:
		//		this function returns a function that searches for nodes and
		//		filters them.  The search may be specialized by infix operators
		//		(">", "~", or "+") else it will default to searching all
		//		descendants (the " " selector). Once a group of children is
		//		found, a test function is applied to weed out the ones we
		//		don't want. Many common cases can be fast-pathed. We spend a
		//		lot of cycles to create a dispatcher that doesn't do more work
		//		than necessary at any point since, unlike this function, the
		//		dispatchers will be called every time. The logic of generating
		//		efficient dispatchers looks like this in pseudo code:
		//
		//		# if it's a purely descendant query (no ">", "+", or "~" modifiers)
		//		if infixOperator == " ":
		//			if only(id):
		//				return def(root):
		//					return d.byId(id, root);
		//
		//			elif id:
		//				return def(root):
		//					return filter(d.byId(id, root));
		//
		//			elif cssClass && getElementsByClassName:
		//				return def(root):
		//					return filter(root.getElementsByClassName(cssClass));
		//
		//			elif only(tag):
		//				return def(root):
		//					return root.getElementsByTagName(tagName);
		//
		//			else:
		//				# search by tag name, then filter
		//				return def(root):
		//					return filter(root.getElementsByTagName(tagName||"*"));
		//
		//		elif infixOperator == ">":
		//			# search direct children
		//			return def(root):
		//				return filter(root.children);
		//
		//		elif infixOperator == "+":
		//			# search next sibling
		//			return def(root):
		//				return filter(root.nextElementSibling);
		//
		//		elif infixOperator == "~":
		//			# search rightward siblings
		//			return def(root):
		//				return filter(nextSiblings(root));

		var io = query.infixOper;
		var oper = (io ? io.oper : "");
		// the default filter func which tests for all conditions in the query
		// part. This is potentially inefficient, so some optimized paths may
		// re-define it to test fewer things.
		var filterFunc = getSimpleFilterFunc(query, { el: 1 });
		var qt = query.tag;
		var wildcardTag = ("*" == qt);
		var ecs = getDoc()["getElementsByClassName"];

		if(!oper){
			// if there's no infix operator, then it's a descendant query. ID
			// and "elements by class name" variants can be accelerated so we
			// call them out explicitly:
			if(query.id){
				// testing shows that the overhead of yesman() is acceptable
				// and can save us some bytes vs. re-defining the function
				// everywhere.
				filterFunc = (!query.loops && wildcardTag) ?
					yesman :
					getSimpleFilterFunc(query, { el: 1, id: 1 });

				retFunc = function(root, arr){
					var te = dom.byId(query.id, (root.ownerDocument||root));
					if(!te || !filterFunc(te)){ return; }
					if(9 == root.nodeType){ // if root's a doc, we just return directly
						return getArr(te, arr);
					}else{ // otherwise check ancestry
						if(_isDescendant(te, root)){
							return getArr(te, arr);
						}
					}
				}
			}else if(
				ecs &&
				// isAlien check. Workaround for Prototype.js being totally evil/dumb.
				/\{\s*\[native code\]\s*\}/.test(String(ecs)) &&
				query.classes.length &&
				!cssCaseBug
			){
				// it's a class-based query and we've got a fast way to run it.

				// ignore class and ID filters since we will have handled both
				filterFunc = getSimpleFilterFunc(query, { el: 1, classes: 1, id: 1 });
				var classesString = query.classes.join(" ");
				retFunc = function(root, arr, bag){
					var ret = getArr(0, arr), te, x=0;
					var tret = root.getElementsByClassName(classesString);
					while((te = tret[x++])){
						if(filterFunc(te, root) && _isUnique(te, bag)){
							ret.push(te);
						}
					}
					return ret;
				};

			}else if(!wildcardTag && !query.loops){
				// it's tag only. Fast-path it.
				retFunc = function(root, arr, bag){
					var ret = getArr(0, arr), te, x=0;
					var tret = root.getElementsByTagName(query.getTag());
					while((te = tret[x++])){
						if(_isUnique(te, bag)){
							ret.push(te);
						}
					}
					return ret;
				};
			}else{
				// the common case:
				//		a descendant selector without a fast path. By now it's got
				//		to have a tag selector, even if it's just "*" so we query
				//		by that and filter
				filterFunc = getSimpleFilterFunc(query, { el: 1, tag: 1, id: 1 });
				retFunc = function(root, arr, bag){
					var ret = getArr(0, arr), te, x=0;
					// we use getTag() to avoid case sensitivity issues
					var tret = root.getElementsByTagName(query.getTag());
					while((te = tret[x++])){
						if(filterFunc(te, root) && _isUnique(te, bag)){
							ret.push(te);
						}
					}
					return ret;
				};
			}
		}else{
			// the query is scoped in some way. Instead of querying by tag we
			// use some other collection to find candidate nodes
			var skipFilters = { el: 1 };
			if(wildcardTag){
				skipFilters.tag = 1;
			}
			filterFunc = getSimpleFilterFunc(query, skipFilters);
			if("+" == oper){
				retFunc = _nextSibling(filterFunc);
			}else if("~" == oper){
				retFunc = _nextSiblings(filterFunc);
			}else if(">" == oper){
				retFunc = _childElements(filterFunc);
			}
		}
		// cache it and return
		return _getElementsFuncCache[query.query] = retFunc;
	};

	var filterDown = function(root, queryParts){
		// NOTE:
		//		this is the guts of the DOM query system. It takes a list of
		//		parsed query parts and a root and finds children which match
		//		the selector represented by the parts
		var candidates = getArr(root), qp, x, te, qpl = queryParts.length, bag, ret;

		for(var i = 0; i < qpl; i++){
			ret = [];
			qp = queryParts[i];
			x = candidates.length - 1;
			if(x > 0){
				// if we have more than one root at this level, provide a new
				// hash to use for checking group membership but tell the
				// system not to post-filter us since we will already have been
				// gauranteed to be unique
				bag = {};
				ret.nozip = true;
			}
			var gef = getElementsFunc(qp);
			for(var j = 0; (te = candidates[j]); j++){
				// for every root, get the elements that match the descendant
				// selector, adding them to the "ret" array and filtering them
				// via membership in this level's bag. If there are more query
				// parts, then this level's return will be used as the next
				// level's candidates
				gef(te, ret, bag);
			}
			if(!ret.length){ break; }
			candidates = ret;
		}
		return ret;
	};

	////////////////////////////////////////////////////////////////////////
	// the query runner
	////////////////////////////////////////////////////////////////////////

	// these are the primary caches for full-query results. The query
	// dispatcher functions are generated then stored here for hash lookup in
	// the future
	var _queryFuncCacheDOM = {},
		_queryFuncCacheQSA = {};

	// this is the second level of spliting, from full-length queries (e.g.,
	// "div.foo .bar") into simple query expressions (e.g., ["div.foo",
	// ".bar"])
	var getStepQueryFunc = function(query){
		var qparts = getQueryParts(trim(query));

		// if it's trivial, avoid iteration and zipping costs
		if(qparts.length == 1){
			// we optimize this case here to prevent dispatch further down the
			// chain, potentially slowing things down. We could more elegantly
			// handle this in filterDown(), but it's slower for simple things
			// that need to be fast (e.g., "#someId").
			var tef = getElementsFunc(qparts[0]);
			return function(root){
				var r = tef(root, []);
				if(r){ r.nozip = true; }
				return r;
			}
		}

		// otherwise, break it up and return a runner that iterates over the parts recursively
		return function(root){
			return filterDown(root, qparts);
		}
	};

	// NOTES:
	//	* we can't trust QSA for anything but document-rooted queries, so
	//	  caching is split into DOM query evaluators and QSA query evaluators
	//	* caching query results is dirty and leak-prone (or, at a minimum,
	//	  prone to unbounded growth). Other toolkits may go this route, but
	//	  they totally destroy their own ability to manage their memory
	//	  footprint. If we implement it, it should only ever be with a fixed
	//	  total element reference # limit and an LRU-style algorithm since JS
	//	  has no weakref support. Caching compiled query evaluators is also
	//	  potentially problematic, but even on large documents the size of the
	//	  query evaluators is often < 100 function objects per evaluator (and
	//	  LRU can be applied if it's ever shown to be an issue).
	//	* since IE's QSA support is currently only for HTML documents and even
	//	  then only in IE 8's "standards mode", we have to detect our dispatch
	//	  route at query time and keep 2 separate caches. Ugg.

	// we need to determine if we think we can run a given query via
	// querySelectorAll or if we'll need to fall back on DOM queries to get
	// there. We need a lot of information about the environment and the query
	// to make the determiniation (e.g. does it support QSA, does the query in
	// question work in the native QSA impl, etc.).
	var nua = navigator.userAgent;
	// some versions of Safari provided QSA, but it was buggy and crash-prone.
	// We need te detect the right "internal" webkit version to make this work.
	var wk = "WebKit/";
	var is525 = (
		dojo.isWebKit &&
		(nua.indexOf(wk) > 0) &&
		(parseFloat(nua.split(wk)[1]) > 528)
	);

	// IE QSA queries may incorrectly include comment nodes, so we throw the
	// zipping function into "remove" comments mode instead of the normal "skip
	// it" which every other QSA-clued browser enjoys
	var noZip = dojo.isIE ? "commentStrip" : "nozip";

	var qsa = "querySelectorAll";
	var qsaAvail = (
		!!getDoc()[qsa] &&
		// see #5832
		(!dojo.isSafari || (dojo.isSafari > 3.1) || is525 )
	);

	//Don't bother with n+3 type of matches, IE complains if we modify those.
	var infixSpaceRe = /n\+\d|([^ ])?([>~+])([^ =])?/g;
	var infixSpaceFunc = function(match, pre, ch, post){
		return ch ? (pre ? pre + " " : "") + ch + (post ? " " + post : "") : /*n+3*/ match;
	};

	var getQueryFunc = function(query, forceDOM){
		//Normalize query. The CSS3 selectors spec allows for omitting spaces around
		//infix operators, >, ~ and +
		//Do the work here since detection for spaces is used as a simple "not use QSA"
		//test below.
		query = query.replace(infixSpaceRe, infixSpaceFunc);

		if(qsaAvail){
			// if we've got a cached variant and we think we can do it, run it!
			var qsaCached = _queryFuncCacheQSA[query];
			if(qsaCached && !forceDOM){ return qsaCached; }
		}

		// else if we've got a DOM cached variant, assume that we already know
		// all we need to and use it
		var domCached = _queryFuncCacheDOM[query];
		if(domCached){ return domCached; }

		// TODO:
		//		today we're caching DOM and QSA branches separately so we
		//		recalc useQSA every time. If we had a way to tag root+query
		//		efficiently, we'd be in good shape to do a global cache.

		var qcz = query.charAt(0);
		var nospace = (-1 == query.indexOf(" "));

		// byId searches are wicked fast compared to QSA, even when filtering
		// is required
		if( (query.indexOf("#") >= 0) && (nospace) ){
			forceDOM = true;
		}

		var useQSA = (
			qsaAvail && (!forceDOM) &&
			// as per CSS 3, we can't currently start w/ combinator:
			//		http://www.w3.org/TR/css3-selectors/#w3cselgrammar
			(specials.indexOf(qcz) == -1) &&
			// IE's QSA impl sucks on pseudos
			(!dojo.isIE || (query.indexOf(":") == -1)) &&

			(!(cssCaseBug && (query.indexOf(".") >= 0))) &&

			// FIXME:
			//		need to tighten up browser rules on ":contains" and "|=" to
			//		figure out which aren't good
			//		Latest webkit (around 531.21.8) does not seem to do well with :checked on option
			//		elements, even though according to spec, selected options should
			//		match :checked. So go nonQSA for it:
			//		http://bugs.dojotoolkit.org/ticket/5179
			(query.indexOf(":contains") == -1) && (query.indexOf(":checked") == -1) &&
			(query.indexOf("|=") == -1) // some browsers don't grok it
		);

		// TODO:
		//		if we've got a descendant query (e.g., "> .thinger" instead of
		//		just ".thinger") in a QSA-able doc, but are passed a child as a
		//		root, it should be possible to give the item a synthetic ID and
		//		trivially rewrite the query to the form "#synid > .thinger" to
		//		use the QSA branch


		if(useQSA){
			var tq = (specials.indexOf(query.charAt(query.length-1)) >= 0) ?
						(query + " *") : query;
			return _queryFuncCacheQSA[query] = function(root){
				try{
					// the QSA system contains an egregious spec bug which
					// limits us, effectively, to only running QSA queries over
					// entire documents.  See:
					//		http://ejohn.org/blog/thoughts-on-queryselectorall/
					//	despite this, we can also handle QSA runs on simple
					//	selectors, but we don't want detection to be expensive
					//	so we're just checking for the presence of a space char
					//	right now. Not elegant, but it's cheaper than running
					//	the query parser when we might not need to
					if(!((9 == root.nodeType) || nospace)){ throw ""; }
					var r = root[qsa](tq);
					// skip expensive duplication checks and just wrap in a NodeList
					r[noZip] = true;
					return r;
				}catch(e){
					// else run the DOM branch on this query, ensuring that we
					// default that way in the future
					return getQueryFunc(query, true)(root);
				}
			}
		}else{
			// DOM branch
			var parts = query.split(/\s*,\s*/);
			return _queryFuncCacheDOM[query] = ((parts.length < 2) ?
				// if not a compound query (e.g., ".foo, .bar"), cache and return a dispatcher
				getStepQueryFunc(query) :
				// if it *is* a complex query, break it up into its
				// constituent parts and return a dispatcher that will
				// merge the parts when run
				function(root){
					var pindex = 0, // avoid array alloc for every invocation
						ret = [],
						tp;
					while((tp = parts[pindex++])){
						ret = ret.concat(getStepQueryFunc(tp)(root));
					}
					return ret;
				}
			);
		}
	};

	var _zipIdx = 0;

	// NOTE:
	//		this function is Moo inspired, but our own impl to deal correctly
	//		with XML in IE
	var _nodeUID = dojo.isIE ? function(node){
		if(caseSensitive){
			// XML docs don't have uniqueID on their nodes
			return (node.getAttribute("_uid") || node.setAttribute("_uid", ++_zipIdx) || _zipIdx);

		}else{
			return node.uniqueID;
		}
	} :
	function(node){
		return (node._uid || (node._uid = ++_zipIdx));
	};

	// determine if a node in is unique in a "bag". In this case we don't want
	// to flatten a list of unique items, but rather just tell if the item in
	// question is already in the bag. Normally we'd just use hash lookup to do
	// this for us but IE's DOM is busted so we can't really count on that. On
	// the upside, it gives us a built in unique ID function.
	var _isUnique = function(node, bag){
		if(!bag){ return 1; }
		var id = _nodeUID(node);
		if(!bag[id]){ return bag[id] = 1; }
		return 0;
	};

	// attempt to efficiently determine if an item in a list is a dupe,
	// returning a list of "uniques", hopefully in doucment order
	var _zipIdxName = "_zipIdx";
	var _zip = function(arr){
		if(arr && arr.nozip){
			return arr;
		}
		var ret = [];
		if(!arr || !arr.length){ return ret; }
		if(arr[0]){
			ret.push(arr[0]);
		}
		if(arr.length < 2){ return ret; }

		_zipIdx++;

		// we have to fork here for IE and XML docs because we can't set
		// expandos on their nodes (apparently). *sigh*
		if(dojo.isIE && caseSensitive){
			var szidx = _zipIdx+"";
			arr[0].setAttribute(_zipIdxName, szidx);
			for(var x = 1, te; te = arr[x]; x++){
				if(arr[x].getAttribute(_zipIdxName) != szidx){
					ret.push(te);
				}
				te.setAttribute(_zipIdxName, szidx);
			}
		}else if(dojo.isIE && arr.commentStrip){
			try{
				for(var x = 1, te; te = arr[x]; x++){
					if(_isElement(te)){
						ret.push(te);
					}
				}
			}catch(e){ /* squelch */ }
		}else{
			if(arr[0]){ arr[0][_zipIdxName] = _zipIdx; }
			for(var x = 1, te; te = arr[x]; x++){
				if(arr[x][_zipIdxName] != _zipIdx){
					ret.push(te);
				}
				te[_zipIdxName] = _zipIdx;
			}
		}
		return ret;
	};

	// the main executor
	var query = function(/*String*/ query, /*String|DOMNode?*/ root){
		//	summary:
		//		Returns nodes which match the given CSS3 selector, searching the
		//		entire document by default but optionally taking a node to scope
		//		the search by. Returns an array.
		//	description:
		//		dojo.query() is the swiss army knife of DOM node manipulation in
		//		Dojo. Much like Prototype's "$$" (bling-bling) function or JQuery's
		//		"$" function, dojo.query provides robust, high-performance
		//		CSS-based node selector support with the option of scoping searches
		//		to a particular sub-tree of a document.
		//
		//		Supported Selectors:
		//		--------------------
		//
		//		acme supports a rich set of CSS3 selectors, including:
		//
		//			* class selectors (e.g., `.foo`)
		//			* node type selectors like `span`
		//			* ` ` descendant selectors
		//			* `>` child element selectors
		//			* `#foo` style ID selectors
		//			* `*` universal selector
		//			* `~`, the preceded-by sibling selector
		//			* `+`, the immediately preceded-by sibling selector
		//			* attribute queries:
		//			|	* `[foo]` attribute presence selector
		//			|	* `[foo='bar']` attribute value exact match
		//			|	* `[foo~='bar']` attribute value list item match
		//			|	* `[foo^='bar']` attribute start match
		//			|	* `[foo$='bar']` attribute end match
		//			|	* `[foo*='bar']` attribute substring match
		//			* `:first-child`, `:last-child`, and `:only-child` positional selectors
		//			* `:empty` content emtpy selector
		//			* `:checked` pseudo selector
		//			* `:nth-child(n)`, `:nth-child(2n+1)` style positional calculations
		//			* `:nth-child(even)`, `:nth-child(odd)` positional selectors
		//			* `:not(...)` negation pseudo selectors
		//
		//		Any legal combination of these selectors will work with
		//		`dojo.query()`, including compound selectors ("," delimited).
		//		Very complex and useful searches can be constructed with this
		//		palette of selectors and when combined with functions for
		//		manipulation presented by dojo.NodeList, many types of DOM
		//		manipulation operations become very straightforward.
		//
		//		Unsupported Selectors:
		//		----------------------
		//
		//		While dojo.query handles many CSS3 selectors, some fall outside of
		//		what's reasonable for a programmatic node querying engine to
		//		handle. Currently unsupported selectors include:
		//
		//			* namespace-differentiated selectors of any form
		//			* all `::` pseduo-element selectors
		//			* certain pseduo-selectors which don't get a lot of day-to-day use:
		//			|	* `:root`, `:lang()`, `:target`, `:focus`
		//			* all visual and state selectors:
		//			|	* `:root`, `:active`, `:hover`, `:visisted`, `:link`,
		//				  `:enabled`, `:disabled`
		//			* `:*-of-type` pseudo selectors
		//
		//		dojo.query and XML Documents:
		//		-----------------------------
		//
		//		`dojo.query` (as of dojo 1.2) supports searching XML documents
		//		in a case-sensitive manner. If an HTML document is served with
		//		a doctype that forces case-sensitivity (e.g., XHTML 1.1
		//		Strict), dojo.query() will detect this and "do the right
		//		thing". Case sensitivity is dependent upon the document being
		//		searched and not the query used. It is therefore possible to
		//		use case-sensitive queries on strict sub-documents (iframes,
		//		etc.) or XML documents while still assuming case-insensitivity
		//		for a host/root document.
		//
		//		Non-selector Queries:
		//		---------------------
		//
		//		If something other than a String is passed for the query,
		//		`dojo.query` will return a new `dojo.NodeList` instance
		//		constructed from that parameter alone and all further
		//		processing will stop. This means that if you have a reference
		//		to a node or NodeList, you can quickly construct a new NodeList
		//		from the original by calling `dojo.query(node)` or
		//		`dojo.query(list)`.
		//
		//	query:
		//		The CSS3 expression to match against. For details on the syntax of
		//		CSS3 selectors, see <http://www.w3.org/TR/css3-selectors/#selectors>
		//	root:
		//		A DOMNode (or node id) to scope the search from. Optional.
		//	returns: Array
		//	example:
		//		search the entire document for elements with the class "foo":
		//	|	dojo.query(".foo");
		//		these elements will match:
		//	|	<span class="foo"></span>
		//	|	<span class="foo bar"></span>
		//	|	<p class="thud foo"></p>
		//	example:
		//		search the entire document for elements with the classes "foo" *and* "bar":
		//	|	dojo.query(".foo.bar");
		//		these elements will match:
		//	|	<span class="foo bar"></span>
		//		while these will not:
		//	|	<span class="foo"></span>
		//	|	<p class="thud foo"></p>
		//	example:
		//		find `<span>` elements which are descendants of paragraphs and
		//		which have a "highlighted" class:
		//	|	dojo.query("p span.highlighted");
		//		the innermost span in this fragment matches:
		//	|	<p class="foo">
		//	|		<span>...
		//	|			<span class="highlighted foo bar">...</span>
		//	|		</span>
		//	|	</p>
		//	example:
		//		set an "odd" class on all odd table rows inside of the table
		//		`#tabular_data`, using the `>` (direct child) selector to avoid
		//		affecting any nested tables:
		//	|	dojo.query("#tabular_data > tbody > tr:nth-child(odd)").addClass("odd");
		//	example:
		//		remove all elements with the class "error" from the document
		//		and store them in a list:
		//	|	var errors = dojo.query(".error").orphan();
		//	example:
		//		add an onclick handler to every submit button in the document
		//		which causes the form to be sent via Ajax instead:
		//	|	dojo.query("input[type='submit']").onclick(function(e){
		//	|		dojo.stopEvent(e); // prevent sending the form
		//	|		var btn = e.target;
		//	|		dojo.xhrPost({
		//	|			form: btn.form,
		//	|			load: function(data){
		//	|				// replace the form with the response
		//	|				var div = dojo.doc.createElement("div");
		//	|				dojo.place(div, btn.form, "after");
		//	|				div.innerHTML = data;
		//	|				dojo.style(btn.form, "display", "none");
		//	|			}
		//	|		});
		//	|	});

		root = root||getDoc();
		var od = root.ownerDocument||root.documentElement;

		// throw the big case sensitivity switch

		// NOTE:
		//		Opera in XHTML mode doesn't detect case-sensitivity correctly
		//		and it's not clear that there's any way to test for it
		caseSensitive = (root.contentType && root.contentType=="application/xml") ||
						(dojo.isOpera && (root.doctype || od.toString() == "[object XMLDocument]")) ||
						(!!od) &&
				(dojo.isIE ? od.xml : (root.xmlVersion || od.xmlVersion));

		// NOTE:
		//		adding "true" as the 2nd argument to getQueryFunc is useful for
		//		testing the DOM branch without worrying about the
		//		behavior/performance of the QSA branch.
		var r = getQueryFunc(query)(root);

		// FIXME:
		//		need to investigate this branch WRT #8074 and #8075
		if(r && r.nozip){
			return r;
		}
		return _zip(r); // dojo.NodeList
	};
	query.filter = function(/*Node[]*/ nodeList, /*String*/ filter, /*String|DOMNode?*/ root){
		// summary:
		// 		function for filtering a NodeList based on a selector, optimized for simple selectors
		var tmpNodeList = [],
			parts = getQueryParts(filter),
			filterFunc =
				(parts.length == 1 && !/[^\w#\.]/.test(filter)) ?
				getSimpleFilterFunc(parts[0]) :
				function(node){
					return dojo.query(filter, root).indexOf(node) != -1;
				};
		for(var x = 0, te; te = nodeList[x]; x++){
			if(filterFunc(te)){ tmpNodeList.push(te); }
		}
		return tmpNodeList;
	};
	return query;
});//end defineQuery

},
'dojox/charting/Series':function(){
define("dojox/charting/Series", ["dojo/_base/lang", "dojo/_base/declare", "./Element"], 
	function(lang, declare, Element){ 
	/*=====
	dojox.charting.__SeriesCtorArgs = function(plot){
		//	summary:
		//		An optional arguments object that can be used in the Series constructor.
		//	plot: String?
		//		The plot (by name) that this series belongs to.
		this.plot = plot;
	}

	var Element = dojox.charting.Element;
	=====*/
	return declare("dojox.charting.Series", Element, {
		//	summary:
		//		An object representing a series of data for plotting on a chart.
		constructor: function(chart, data, kwArgs){
			//	summary:
			//		Create a new data series object for use within charting.
			//	chart: dojox.charting.Chart
			//		The chart that this series belongs to.
			//	data: Array|Object:
			//		The array of data points (either numbers or objects) that
			//		represents the data to be drawn. Or it can be an object. In
			//		the latter case, it should have a property "data" (an array),
			//		destroy(), and setSeriesObject().
			//	kwArgs: dojox.charting.__SeriesCtorArgs?
			//		An optional keyword arguments object to set details for this series.
			lang.mixin(this, kwArgs);
			if(typeof this.plot != "string"){ this.plot = "default"; }
			this.update(data);
		},
	
		clear: function(){
			//	summary:
			//		Clear the calculated additional parameters set on this series.
			this.dyn = {};
		},
		
		update: function(data){
			//	summary:
			//		Set data and make this object dirty, so it can be redrawn.
			//	data: Array|Object:
			//		The array of data points (either numbers or objects) that
			//		represents the data to be drawn. Or it can be an object. In
			//		the latter case, it should have a property "data" (an array),
			//		destroy(), and setSeriesObject().
			if(lang.isArray(data)){
				this.data = data;
			}else{
				this.source = data;
				this.data = this.source.data;
				if(this.source.setSeriesObject){
					this.source.setSeriesObject(this);
				}
			}
			this.dirty = true;
			this.clear();
		}
	});

});

},
'dojox/charting/plot2d/Default':function(){
define("dojox/charting/plot2d/Default", ["dojo/_base/lang", "dojo/_base/declare", "dojo/_base/array", 
		"./Base", "./common", "dojox/lang/functional", "dojox/lang/functional/reversed", "dojox/lang/utils", "dojox/gfx/fx"], 
	function(lang, declare, arr, Base, dc, df, dfr, du, fx){

	/*=====
	dojo.declare("dojox.charting.plot2d.__DefaultCtorArgs", dojox.charting.plot2d.__PlotCtorArgs, {
		//	summary:
		//		The arguments used for any/most plots.
	
		//	hAxis: String?
		//		The horizontal axis name.
		hAxis: "x",
	
		//	vAxis: String?
		//		The vertical axis name
		vAxis: "y",
	
		//	lines: Boolean?
		//		Whether or not to draw lines on this plot.  Defaults to true.
		lines:   true,
	
		//	areas: Boolean?
		//		Whether or not to draw areas on this plot. Defaults to false.
		areas:   false,
	
		//	markers: Boolean?
		//		Whether or not to draw markers at data points on this plot. Default is false.
		markers: false,
	
		//	tension: Number|String?
		//		Whether or not to apply 'tensioning' to the lines on this chart.
		//		Options include a number, "X", "x", or "S"; if a number is used, the
		//		simpler bezier curve calculations are used to draw the lines.  If X, x or S
		//		is used, the more accurate smoothing algorithm is used.
		tension: "",
	
		//	animate: Boolean?
		//		Whether or not to animate the chart to place.
		animate: false,
	
		//	stroke: dojox.gfx.Stroke?
		//		An optional stroke to use for any series on the plot.
		stroke:		{},
	
		//	outline: dojox.gfx.Stroke?
		//		An optional stroke used to outline any series on the plot.
		outline:	{},
	
		//	shadow: dojox.gfx.Stroke?
		//		An optional stroke to use to draw any shadows for a series on a plot.
		shadow:		{},
	
		//	fill: dojox.gfx.Fill?
		//		Any fill to be used for elements on the plot (such as areas).
		fill:		{},
	
		//	font: String?
		//		A font definition to be used for labels and other text-based elements on the plot.
		font:		"",
	
		//	fontColor: String|dojo.Color?
		//		The color to be used for any text-based elements on the plot.
		fontColor:	"",
	
		//	markerStroke: dojo.gfx.Stroke?
		//		An optional stroke to use for any markers on the plot.
		markerStroke:		{},
	
		//	markerOutline: dojo.gfx.Stroke?
		//		An optional outline to use for any markers on the plot.
		markerOutline:		{},
	
		//	markerShadow: dojo.gfx.Stroke?
		//		An optional shadow to use for any markers on the plot.
		markerShadow:		{},
	
		//	markerFill: dojo.gfx.Fill?
		//		An optional fill to use for any markers on the plot.
		markerFill:			{},
	
		//	markerFont: String?
		//		An optional font definition to use for any markers on the plot.
		markerFont:			"",
	
		//	markerFontColor: String|dojo.Color?
		//		An optional color to use for any marker text on the plot.
		markerFontColor:	"",
		
		//	enableCache: Boolean?
		//		Whether the markers are cached from one rendering to another. This improves the rendering performance of
		//		successive rendering but penalize the first rendering.  Default false.
		enableCache: false
	});
	
	var Base = dojox.charting.plot2d.Base;
=====*/

	var purgeGroup = dfr.lambda("item.purgeGroup()");

	var DEFAULT_ANIMATION_LENGTH = 1200;	// in ms

	return declare("dojox.charting.plot2d.Default", Base, {
		defaultParams: {
			hAxis: "x",		// use a horizontal axis named "x"
			vAxis: "y",		// use a vertical axis named "y"
			lines:   true,	// draw lines
			areas:   false,	// draw areas
			markers: false,	// draw markers
			tension: "",	// draw curved lines (tension is "X", "x", or "S")
			animate: false, // animate chart to place
			enableCache: false 
		},
		optionalParams: {
			// theme component
			stroke:		{},
			outline:	{},
			shadow:		{},
			fill:		{},
			font:		"",
			fontColor:	"",
			markerStroke:		{},
			markerOutline:		{},
			markerShadow:		{},
			markerFill:			{},
			markerFont:			"",
			markerFontColor:	""
		},

		constructor: function(chart, kwArgs){
			//	summary:
			//		Return a new plot.
			//	chart: dojox.charting.Chart
			//		The chart this plot belongs to.
			//	kwArgs: dojox.charting.plot2d.__DefaultCtorArgs?
			//		An optional arguments object to help define this plot.
			this.opt = lang.clone(this.defaultParams);
            du.updateWithObject(this.opt, kwArgs);
            du.updateWithPattern(this.opt, kwArgs, this.optionalParams);
			this.series = [];
			this.hAxis = this.opt.hAxis;
			this.vAxis = this.opt.vAxis;

			// animation properties
			this.animate = this.opt.animate;
		},

		createPath: function(run, creator, params){
			var path;
			if(this.opt.enableCache && run._pathFreePool.length > 0){
				path = run._pathFreePool.pop();
				path.setShape(params);
				// was cleared, add it back
				creator.add(path);
			}else{
				path = creator.createPath(params);
			}
			if(this.opt.enableCache){
				run._pathUsePool.push(path);
			}
			return path;
		},

		render: function(dim, offsets){
			//	summary:
			//		Render/draw everything on this plot.
			//	dim: Object
			//		An object of the form { width, height }
			//	offsets: Object
			//		An object of the form { l, r, t, b }
			//	returns: dojox.charting.plot2d.Default
			//		A reference to this plot for functional chaining.

			// make sure all the series is not modified
			if(this.zoom && !this.isDataDirty()){
				return this.performZoom(dim, offsets);
			}

			this.resetEvents();
			this.dirty = this.isDirty();
			if(this.dirty){
				arr.forEach(this.series, purgeGroup);
				this._eventSeries = {};
				this.cleanGroup();
				this.group.setTransform(null);
				var s = this.group;
				df.forEachRev(this.series, function(item){ item.cleanGroup(s); });
			}
			var t = this.chart.theme, stroke, outline, marker, events = this.events();

			for(var i = this.series.length - 1; i >= 0; --i){
				var run = this.series[i];
				if(!this.dirty && !run.dirty){
					t.skip();
					this._reconnectEvents(run.name);
					continue;
				}
				run.cleanGroup();
				if(this.opt.enableCache){
					run._pathFreePool = (run._pathFreePool?run._pathFreePool:[]).concat(run._pathUsePool?run._pathUsePool:[]);
					run._pathUsePool = [];
				}
				if(!run.data.length){
					run.dirty = false;
					t.skip();
					continue;
				}

				var theme = t.next(this.opt.areas ? "area" : "line", [this.opt, run], true),
					s = run.group, rsegments = [], startindexes = [], rseg = null, lpoly,
					ht = this._hScaler.scaler.getTransformerFromModel(this._hScaler),
					vt = this._vScaler.scaler.getTransformerFromModel(this._vScaler),
					eventSeries = this._eventSeries[run.name] = new Array(run.data.length);
				
				// optim works only for index based case
				var indexed = typeof run.data[0] == "number";
				var min = indexed?Math.max(0, Math.floor(this._hScaler.bounds.from - 1)):0, 
						max = indexed?Math.min(run.data.length, Math.ceil(this._hScaler.bounds.to)):run.data.length;

                // split the run data into dense segments (each containing no nulls)
                for(var j = min; j < max; j++){
                    if(run.data[j] != null){
                        if(!rseg){
                            rseg = [];
                            startindexes.push(j);
                            rsegments.push(rseg);
                        }
                        rseg.push(run.data[j]);
                    }else{
                        rseg = null;
                    }
                }

                for(var seg = 0; seg < rsegments.length; seg++){
					if(typeof rsegments[seg][0] == "number"){
						lpoly = arr.map(rsegments[seg], function(v, i){
							return {
								x: ht(i + startindexes[seg] + 1) + offsets.l,
								y: dim.height - offsets.b - vt(v)
							};
						}, this);
					}else{
						lpoly = arr.map(rsegments[seg], function(v, i){
							return {
								x: ht(v.x) + offsets.l,
								y: dim.height - offsets.b - vt(v.y)
							};
						}, this);
					}

					var lpath = this.opt.tension ? dc.curve(lpoly, this.opt.tension) : "";

					if(this.opt.areas && lpoly.length > 1){
						var fill = theme.series.fill;
						var apoly = lang.clone(lpoly);
						if(this.opt.tension){
							var apath = "L" + apoly[apoly.length-1].x + "," + (dim.height - offsets.b) +
								" L" + apoly[0].x + "," + (dim.height - offsets.b) +
								" L" + apoly[0].x + "," + apoly[0].y;
							run.dyn.fill = s.createPath(lpath + " " + apath).setFill(fill).getFill();
						} else {
							apoly.push({x: lpoly[lpoly.length - 1].x, y: dim.height - offsets.b});
							apoly.push({x: lpoly[0].x, y: dim.height - offsets.b});
							apoly.push(lpoly[0]);
							run.dyn.fill = s.createPolyline(apoly).setFill(fill).getFill();
						}
					}
					if(this.opt.lines || this.opt.markers){
						// need a stroke
						stroke = theme.series.stroke;
						if(theme.series.outline){
							outline = run.dyn.outline = dc.makeStroke(theme.series.outline);
							outline.width = 2 * outline.width + stroke.width;
						}
					}
					if(this.opt.markers){
						run.dyn.marker = theme.symbol;
					}
					var frontMarkers = null, outlineMarkers = null, shadowMarkers = null;
					if(stroke && theme.series.shadow && lpoly.length > 1){
						var shadow = theme.series.shadow,
							spoly = arr.map(lpoly, function(c){
								return {x: c.x + shadow.dx, y: c.y + shadow.dy};
							});
						if(this.opt.lines){
							if(this.opt.tension){
								run.dyn.shadow = s.createPath(dc.curve(spoly, this.opt.tension)).setStroke(shadow).getStroke();
							} else {
								run.dyn.shadow = s.createPolyline(spoly).setStroke(shadow).getStroke();
							}
						}
						if(this.opt.markers && theme.marker.shadow){
							shadow = theme.marker.shadow;
							shadowMarkers = arr.map(spoly, function(c){
								return this.createPath(run, s, "M" + c.x + " " + c.y + " " + theme.symbol).
									setStroke(shadow).setFill(shadow.color);
							}, this);
						}
					}
					if(this.opt.lines && lpoly.length > 1){
						if(outline){
							if(this.opt.tension){
								run.dyn.outline = s.createPath(lpath).setStroke(outline).getStroke();
							} else {
								run.dyn.outline = s.createPolyline(lpoly).setStroke(outline).getStroke();
							}
						}
						if(this.opt.tension){
							run.dyn.stroke = s.createPath(lpath).setStroke(stroke).getStroke();
						} else {
							run.dyn.stroke = s.createPolyline(lpoly).setStroke(stroke).getStroke();
						}
					}
					if(this.opt.markers){
						frontMarkers = new Array(lpoly.length);
						outlineMarkers = new Array(lpoly.length);
						outline = null;
						if(theme.marker.outline){
							outline = dc.makeStroke(theme.marker.outline);
							outline.width = 2 * outline.width + (theme.marker.stroke ? theme.marker.stroke.width : 0);
						}
						arr.forEach(lpoly, function(c, i){
							var path = "M" + c.x + " " + c.y + " " + theme.symbol;
							if(outline){
								outlineMarkers[i] = this.createPath(run, s, path).setStroke(outline);
							}
							frontMarkers[i] = this.createPath(run, s, path).setStroke(theme.marker.stroke).setFill(theme.marker.fill);
						}, this);
						run.dyn.markerFill = theme.marker.fill;
						run.dyn.markerStroke = theme.marker.stroke;
						if(events){
							arr.forEach(frontMarkers, function(s, i){
								var o = {
									element: "marker",
									index:   i + startindexes[seg],
									run:     run,
									shape:   s,
									outline: outlineMarkers[i] || null,
									shadow:  shadowMarkers && shadowMarkers[i] || null,
									cx:      lpoly[i].x,
									cy:      lpoly[i].y
								};
								if(typeof rsegments[seg][0] == "number"){
									o.x = i + startindexes[seg] + 1;
									o.y = rsegments[seg][i];
								}else{
									o.x = rsegments[seg][i].x;
									o.y = rsegments[seg][i].y;
								}
								this._connectEvents(o);
								eventSeries[i + startindexes[seg]] = o;
							}, this);
						}else{
							delete this._eventSeries[run.name];
						}
					}
                }
				run.dirty = false;
			}
			if(this.animate){
				// grow from the bottom
				var plotGroup = this.group;
				fx.animateTransform(lang.delegate({
					shape: plotGroup,
					duration: DEFAULT_ANIMATION_LENGTH,
					transform:[
						{name:"translate", start: [0, dim.height - offsets.b], end: [0, 0]},
						{name:"scale", start: [1, 0], end:[1, 1]},
						{name:"original"}
					]
				}, this.animate)).play();
			}
			this.dirty = false;
			return this;	//	dojox.charting.plot2d.Default
		}
	});
});

},
'dojo/store/Memory':function(){
define(["../_base/declare", "./util/QueryResults", "./util/SimpleQueryEngine"], function(declare, QueryResults, SimpleQueryEngine) {
  //  module:
  //    dojo/store/Memory
  //  summary:
  //    The module defines an in-memory object store.


return declare("dojo.store.Memory", null, {
	// summary:
	//		This is a basic in-memory object store. It implements dojo.store.api.Store.
	constructor: function(/*dojo.store.Memory*/ options){
		// summary:
		//		Creates a memory object store.
		// options:
		//		This provides any configuration information that will be mixed into the store.
		// 		This should generally include the data property to provide the starting set of data.
		for(var i in options){
			this[i] = options[i];
		}
		this.setData(this.data || []);
	},
	// data: Array
	//		The array of all the objects in the memory store
	data:null,

	// idProperty: String
	//		Indicates the property to use as the identity property. The values of this
	//		property should be unique.
	idProperty: "id",

	// index: Object
	//		An index of data indices into the data array by id
	index:null,

	// queryEngine: Function
	//		Defines the query engine to use for querying the data store
	queryEngine: SimpleQueryEngine,
	get: function(id){
		//	summary:
		//		Retrieves an object by its identity
		//	id: Number
		//		The identity to use to lookup the object
		//	returns: Object
		//		The object in the store that matches the given id.
		return this.data[this.index[id]];
	},
	getIdentity: function(object){
		// 	summary:
		//		Returns an object's identity
		// 	object: Object
		//		The object to get the identity from
		//	returns: Number
		return object[this.idProperty];
	},
	put: function(object, options){
		// 	summary:
		//		Stores an object
		// 	object: Object
		//		The object to store.
		// 	options: dojo.store.api.Store.PutDirectives??
		//		Additional metadata for storing the data.  Includes an "id"
		//		property if a specific id is to be used.
		//	returns: Number
		var data = this.data,
			index = this.index,
			idProperty = this.idProperty;
		var id = (options && "id" in options) ? options.id : idProperty in object ? object[idProperty] : Math.random();
		if(id in index){
			// object exists
			if(options && options.overwrite === false){
				throw new Error("Object already exists");
			}
			// replace the entry in data
			data[index[id]] = object;
		}else{
			// add the new object
			index[id] = data.push(object) - 1;
		}
		return id;
	},
	add: function(object, options){
		// 	summary:
		//		Creates an object, throws an error if the object already exists
		// 	object: Object
		//		The object to store.
		// 	options: dojo.store.api.Store.PutDirectives??
		//		Additional metadata for storing the data.  Includes an "id"
		//		property if a specific id is to be used.
		//	returns: Number
		(options = options || {}).overwrite = false;
		// call put with overwrite being false
		return this.put(object, options);
	},
	remove: function(id){
		// 	summary:
		//		Deletes an object by its identity
		// 	id: Number
		//		The identity to use to delete the object
		// returns: Boolean
		// 		Returns true if an object was removed, falsy (undefined) if no object matched the id
		var index = this.index;
		var data = this.data;
		if(id in index){
			data.splice(index[id], 1);
			// now we have to reindex
			this.setData(data);
			return true;
		}
	},
	query: function(query, options){
		// 	summary:
		//		Queries the store for objects.
		// 	query: Object
		//		The query to use for retrieving objects from the store.
		//	options: dojo.store.api.Store.QueryOptions?
		//		The optional arguments to apply to the resultset.
		//	returns: dojo.store.api.Store.QueryResults
		//		The results of the query, extended with iterative methods.
		//
		// 	example:
		// 		Given the following store:
		//
		// 	|	var store = new dojo.store.Memory({
		// 	|		data: [
		// 	|			{id: 1, name: "one", prime: false },
		//	|			{id: 2, name: "two", even: true, prime: true},
		//	|			{id: 3, name: "three", prime: true},
		//	|			{id: 4, name: "four", even: true, prime: false},
		//	|			{id: 5, name: "five", prime: true}
		//	|		]
		//	|	});
		//
		//	...find all items where "prime" is true:
		//
		//	|	var results = store.query({ prime: true });
		//
		//	...or find all items where "even" is true:
		//
		//	|	var results = store.query({ even: true });
		return QueryResults(this.queryEngine(query, options)(this.data));
	},
	setData: function(data){
		// 	summary:
		//		Sets the given data as the source for this store, and indexes it
		//	data: Object[]
		//		An array of objects to use as the source of data.
		if(data.items){
			// just for convenience with the data format IFRS expects
			this.idProperty = data.identifier;
			data = this.data = data.items;
		}else{
			this.data = data;
		}
		this.index = {};
		for(var i = 0, l = data.length; i < l; i++){
			this.index[data[i][this.idProperty]] = i;
		}
	}
});

});

},
'dojox/charting/plot2d/Base':function(){
define("dojox/charting/plot2d/Base", ["dojo/_base/lang", "dojo/_base/declare", "dojo/_base/connect", 
		"../Element", "./_PlotEvents", "dojo/_base/array",
		"../scaler/primitive", "./common", "dojox/gfx/fx"],
	function(lang, declare, hub, Element, PlotEvents, arr, primitive, common, fx){
/*=====
var Element = dojox.charting.Element;
var PlotEvents = dojox.charting.plot2d._PlotEvents;
dojox.charting.plot2d.__PlotCtorArgs = function(){
	//	summary:
	//		The base keyword arguments object for plot constructors.
	//		Note that the parameters for this may change based on the
	//		specific plot type (see the corresponding plot type for
	//		details).
}
=====*/
return declare("dojox.charting.plot2d.Base", [Element, PlotEvents], {
	constructor: function(chart, kwArgs){
		//	summary:
		//		Create a base plot for charting.
		//	chart: dojox.chart.Chart
		//		The chart this plot belongs to.
		//	kwArgs: dojox.charting.plot2d.__PlotCtorArgs?
		//		An optional arguments object to help define the plot.
		this.zoom = null,
		this.zoomQueue = [];	// zooming action task queue
		this.lastWindow = {vscale: 1, hscale: 1, xoffset: 0, yoffset: 0};
	},
	clear: function(){
		//	summary:
		//		Clear out all of the information tied to this plot.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		this.series = [];
		this._hAxis = null;
		this._vAxis = null;
		this.dirty = true;
		return this;	//	dojox.charting.plot2d.Base
	},
	setAxis: function(axis){
		//	summary:
		//		Set an axis for this plot.
		//	axis: dojox.charting.axis2d.Base
		//		The axis to set.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		if(axis){
			this[axis.vertical ? "_vAxis" : "_hAxis"] = axis;
		}
		return this;	//	dojox.charting.plot2d.Base
	},
	toPage: function(coord){
		//	summary:
		//		Compute page coordinates from plot axis data coordinates.
		//	coord: Object?
		//		The coordinates in plot axis data coordinate space. For cartesian charts that is of the following form:
		//			`{ hAxisName: 50, vAxisName: 200 }`
		//		If not provided return the tranform method instead of the result of the transformation.
		//	returns: Object
		//		The resulting page pixel coordinates. That is of the following form:
		//			`{ x: 50, y: 200 }`
		var ah = this._hAxis, av = this._vAxis, 
			sh = ah.getScaler(), sv = av.getScaler(),  
			th = sh.scaler.getTransformerFromModel(sh),
			tv = sv.scaler.getTransformerFromModel(sv),
			c = this.chart.getCoords(),
			o = this.chart.offsets, dim = this.chart.dim;
		var t = function(coord){
			var r = {};
			r.x = th(coord[ah.name]) + c.x + o.l;
			r.y = c.y + dim.height - o.b - tv(coord[av.name]);
			return r;
		};
		// if no coord return the function so that we can capture the current transforms
		// and reuse them later on
		return coord?t(coord):t;
	},
	toData: function(coord){
		//	summary:
		//		Compute plot axis data coordinates from page coordinates.
		//	coord: Object
		//		The pixel coordinate in page coordinate space. That is of the following form:
		//			`{ x: 50, y: 200 }`
		//		If not provided return the tranform method instead of the result of the transformation.
		//	returns: Object
		//		The resulting plot axis data coordinates. For cartesian charts that is of the following form:
		//			`{ hAxisName: 50, vAxisName: 200 }`
		var ah = this._hAxis, av = this._vAxis, 
			sh = ah.getScaler(), sv = av.getScaler(),  
			th = sh.scaler.getTransformerFromPlot(sh),
			tv = sv.scaler.getTransformerFromPlot(sv),
			c = this.chart.getCoords(),
			o = this.chart.offsets, dim = this.chart.dim;
		var t = function(coord){
			var r = {};
			r[ah.name] = th(coord.x - c.x - o.l);
			r[av.name] = tv(c.y + dim.height - coord.y  - o.b);
			return r;
		};
		// if no coord return the function so that we can capture the current transforms
		// and reuse them later on
		return coord?t(coord):t;
	},
	addSeries: function(run){
		//	summary:
		//		Add a data series to this plot.
		//	run: dojox.charting.Series
		//		The series to be added.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		this.series.push(run);
		return this;	//	dojox.charting.plot2d.Base
	},
	getSeriesStats: function(){
		//	summary:
		//		Calculate the min/max on all attached series in both directions.
		//	returns: Object
		//		{hmin, hmax, vmin, vmax} min/max in both directions.
		return common.collectSimpleStats(this.series);
	},
	calculateAxes: function(dim){
		//	summary:
		//		Stub function for running the axis calculations (depricated).
		//	dim: Object
		//		An object of the form { width, height }
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		this.initializeScalers(dim, this.getSeriesStats());
		return this;	//	dojox.charting.plot2d.Base
	},
	isDirty: function(){
		//	summary:
		//		Returns whether or not this plot needs to be rendered.
		//	returns: Boolean
		//		The state of the plot.
		return this.dirty || this._hAxis && this._hAxis.dirty || this._vAxis && this._vAxis.dirty;	//	Boolean
	},
	isDataDirty: function(){
		//	summary:
		//		Returns whether or not any of this plot's data series need to be rendered.
		//	returns: Boolean
		//		Flag indicating if any of this plot's series are invalid and need rendering.
		return arr.some(this.series, function(item){ return item.dirty; });	//	Boolean
	},
	performZoom: function(dim, offsets){
		//	summary:
		//		Create/alter any zooming windows on this plot.
		//	dim: Object
		//		An object of the form { width, height }.
		//	offsets: Object
		//		An object of the form { l, r, t, b }.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.

		// get current zooming various
		var vs = this._vAxis.scale || 1,
			hs = this._hAxis.scale || 1,
			vOffset = dim.height - offsets.b,
			hBounds = this._hScaler.bounds,
			xOffset = (hBounds.from - hBounds.lower) * hBounds.scale,
			vBounds = this._vScaler.bounds,
			yOffset = (vBounds.from - vBounds.lower) * vBounds.scale,
			// get incremental zooming various
			rVScale = vs / this.lastWindow.vscale,
			rHScale = hs / this.lastWindow.hscale,
			rXOffset = (this.lastWindow.xoffset - xOffset)/
				((this.lastWindow.hscale == 1)? hs : this.lastWindow.hscale),
			rYOffset = (yOffset - this.lastWindow.yoffset)/
				((this.lastWindow.vscale == 1)? vs : this.lastWindow.vscale),

			shape = this.group,
			anim = fx.animateTransform(lang.delegate({
				shape: shape,
				duration: 1200,
				transform:[
					{name:"translate", start:[0, 0], end: [offsets.l * (1 - rHScale), vOffset * (1 - rVScale)]},
					{name:"scale", start:[1, 1], end: [rHScale, rVScale]},
					{name:"original"},
					{name:"translate", start: [0, 0], end: [rXOffset, rYOffset]}
				]}, this.zoom));

		lang.mixin(this.lastWindow, {vscale: vs, hscale: hs, xoffset: xOffset, yoffset: yOffset});
		//add anim to zooming action queue,
		//in order to avoid several zooming action happened at the same time
		this.zoomQueue.push(anim);
		//perform each anim one by one in zoomQueue
		hub.connect(anim, "onEnd", this, function(){
			this.zoom = null;
			this.zoomQueue.shift();
			if(this.zoomQueue.length > 0){
				this.zoomQueue[0].play();
			}
		});
		if(this.zoomQueue.length == 1){
			this.zoomQueue[0].play();
		}
		return this;	//	dojox.charting.plot2d.Base
	},
	render: function(dim, offsets){
		//	summary:
		//		Render the plot on the chart.
		//	dim: Object
		//		An object of the form { width, height }.
		//	offsets: Object
		//		An object of the form { l, r, t, b }.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		return this;	//	dojox.charting.plot2d.Base
	},
	getRequiredColors: function(){
		//	summary:
		//		Get how many data series we have, so we know how many colors to use.
		//	returns: Number
		//		The number of colors needed.
		return this.series.length;	//	Number
	},
	initializeScalers: function(dim, stats){
		//	summary:
		//		Initializes scalers using attached axes.
		//	dim: Object:
		//		Size of a plot area in pixels as {width, height}.
		//	stats: Object:
		//		Min/max of data in both directions as {hmin, hmax, vmin, vmax}.
		//	returns: dojox.charting.plot2d.Base
		//		A reference to this plot for functional chaining.
		if(this._hAxis){
			if(!this._hAxis.initialized()){
				this._hAxis.calculate(stats.hmin, stats.hmax, dim.width);
			}
			this._hScaler = this._hAxis.getScaler();
		}else{
			this._hScaler = primitive.buildScaler(stats.hmin, stats.hmax, dim.width);
		}
		if(this._vAxis){
			if(!this._vAxis.initialized()){
				this._vAxis.calculate(stats.vmin, stats.vmax, dim.height);
			}
			this._vScaler = this._vAxis.getScaler();
		}else{
			this._vScaler = primitive.buildScaler(stats.vmin, stats.vmax, dim.height);
		}
		return this;	//	dojox.charting.plot2d.Base
	}
});
});

},
'dojox/gfx':function(){
define("dojox/gfx", ["dojo/_base/lang", "./gfx/_base", "./gfx/renderer!"], 
  function(lang, gfxBase, renderer){
	// module:
	//		dojox/gfx
	// summary:
	//		This the root of the Dojo Graphics package
	gfxBase.switchTo(renderer);
	return gfxBase;
});

},
'dojox/gfx/shape':function(){
define("dojox/gfx/shape", ["./_base", "dojo/_base/lang", "dojo/_base/declare", "dojo/_base/window", "dojo/_base/sniff",
	"dojo/_base/connect", "dojo/_base/array", "dojo/dom-construct", "dojo/_base/Color", "./matrix"], 
  function(g, lang, declare, win, has, events, arr, domConstruct, Color, matrixLib){

/*===== 
	dojox.gfx.shape = {
		// summary:
		//		This module contains the core graphics Shape API.
		//		Different graphics renderer implementation modules (svg, canvas, vml, silverlight, etc.) extend this 
		//		basic api to provide renderer-specific implementations for each shape.
	};
  =====*/

	var shape = g.shape = {};
	// a set of ids (keys=type)
	var _ids = {};
	// a simple set impl to map shape<->id
	var registry = {};
	
	shape.register = function(/*dojox.gfx.shape.Shape*/shape){
		// summary: 
		//		Register the specified shape into the graphics registry.
		// shape: dojox.gfx.shape.Shape
		//		The shape to register.
		// returns:
		//		The unique id associated with this shape.
		// the id pattern : type+number (ex: Rect0,Rect1,etc)
		var t = shape.declaredClass.split('.').pop();
		var i = t in _ids ? ++_ids[t] : ((_ids[t] = 0));
		var uid = t+i;
		registry[uid] = shape;
		return uid;
	};
	
	shape.byId = function(/*String*/id){
		// summary: 
		//		Returns the shape that matches the specified id.
		// id: String
		//		The unique identifier for this Shape.
		return registry[id]; //dojox.gfx.shape.Shape
	};
	
	shape.dispose = function(/*dojox.gfx.shape.Shape*/shape){
		// summary: 
		//		Removes the specified shape from the registry.
		// shape: dojox.gfx.shape.Shape
		//		The shape to unregister.
		delete registry[shape.getUID()];
	};
	
	declare("dojox.gfx.shape.Shape", null, {
		// summary: a Shape object, which knows how to apply
		// graphical attributes and transformations
	
		constructor: function(){
			//	rawNode: Node
			//		underlying graphics-renderer-specific implementation object (if applicable)
			this.rawNode = null;
			//	shape: Object: an abstract shape object
			//	(see dojox.gfx.defaultPath,
			//	dojox.gfx.defaultPolyline,
			//	dojox.gfx.defaultRect,
			//	dojox.gfx.defaultEllipse,
			//	dojox.gfx.defaultCircle,
			//	dojox.gfx.defaultLine,
			//	or dojox.gfx.defaultImage)
			this.shape = null;
	
			//	matrix: dojox.gfx.Matrix2D
			//		a transformation matrix
			this.matrix = null;
	
			//	fillStyle: Object
			//		a fill object
			//		(see dojox.gfx.defaultLinearGradient,
			//		dojox.gfx.defaultRadialGradient,
			//		dojox.gfx.defaultPattern,
			//		or dojo.Color)
			this.fillStyle = null;
	
			//	strokeStyle: Object
			//		a stroke object
			//		(see dojox.gfx.defaultStroke)
			this.strokeStyle = null;
	
			// bbox: dojox.gfx.Rectangle
			//		a bounding box of this shape
			//		(see dojox.gfx.defaultRect)
			this.bbox = null;
	
			// virtual group structure
	
			// parent: Object
			//		a parent or null
			//		(see dojox.gfx.Surface,
			//		dojox.gfx.shape.VirtualGroup,
			//		or dojox.gfx.Group)
			this.parent = null;
	
			// parentMatrix: dojox.gfx.Matrix2D
			//	a transformation matrix inherited from the parent
			this.parentMatrix = null;
			
			var uid = shape.register(this);
			this.getUID = function(){
				return uid;
			}
		},	
	
		// trivial getters
	
		getNode: function(){
			// summary: Different graphics rendering subsystems implement shapes in different ways.  This
			//	method provides access to the underlying graphics subsystem object.  Clients calling this
			//	method and using the return value must be careful not to try sharing or using the underlying node
			//	in a general way across renderer implementation.
			//	Returns the underlying graphics Node, or null if no underlying graphics node is used by this shape.
			return this.rawNode; // Node
		},
		getShape: function(){
			// summary: returns the current Shape object or null
			//	(see dojox.gfx.defaultPath,
			//	dojox.gfx.defaultPolyline,
			//	dojox.gfx.defaultRect,
			//	dojox.gfx.defaultEllipse,
			//	dojox.gfx.defaultCircle,
			//	dojox.gfx.defaultLine,
			//	or dojox.gfx.defaultImage)
			return this.shape; // Object
		},
		getTransform: function(){
			// summary: Returns the current transformation matrix applied to this Shape or null
			return this.matrix;	// dojox.gfx.Matrix2D
		},
		getFill: function(){
			// summary: Returns the current fill object or null
			//	(see dojox.gfx.defaultLinearGradient,
			//	dojox.gfx.defaultRadialGradient,
			//	dojox.gfx.defaultPattern,
			//	or dojo.Color)
			return this.fillStyle;	// Object
		},
		getStroke: function(){
			// summary: Returns the current stroke object or null
			//	(see dojox.gfx.defaultStroke)
			return this.strokeStyle;	// Object
		},
		getParent: function(){
			// summary: Returns the parent Shape, Group or VirtualGroup or null if this Shape is unparented.
			//	(see dojox.gfx.Surface,
			//	dojox.gfx.shape.VirtualGroup,
			//	or dojox.gfx.Group)
			return this.parent;	// Object
		},
		getBoundingBox: function(){
			// summary: Returns the bounding box Rectanagle for this shape or null if a BoundingBox cannot be
			//	calculated for the shape on the current renderer or for shapes with no geometric area (points).
			//	A bounding box is a rectangular geometric region
			//	defining the X and Y extent of the shape.
			//	(see dojox.gfx.defaultRect)
			return this.bbox;	// dojox.gfx.Rectangle
		},
		getTransformedBoundingBox: function(){
			// summary: returns an array of four points or null
			//	four points represent four corners of the untransformed bounding box
			var b = this.getBoundingBox();
			if(!b){
				return null;	// null
			}
			var m = this._getRealMatrix(),
				gm = matrixLib;
			return [	// Array
					gm.multiplyPoint(m, b.x, b.y),
					gm.multiplyPoint(m, b.x + b.width, b.y),
					gm.multiplyPoint(m, b.x + b.width, b.y + b.height),
					gm.multiplyPoint(m, b.x, b.y + b.height)
				];
		},
		getEventSource: function(){
			// summary: returns a Node, which is used as
			//	a source of events for this shape
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			return this.rawNode;	// Node
		},
	
		// empty settings
	
		setShape: function(shape){
			// summary: sets a shape object
			//	(the default implementation simply ignores it)
			// shape: Object
			//	a shape object
			//	(see dojox.gfx.defaultPath,
			//	dojox.gfx.defaultPolyline,
			//	dojox.gfx.defaultRect,
			//	dojox.gfx.defaultEllipse,
			//	dojox.gfx.defaultCircle,
			//	dojox.gfx.defaultLine,
			//	or dojox.gfx.defaultImage)
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			this.shape = g.makeParameters(this.shape, shape);
			this.bbox = null;
			return this;	// self
		},
		setFill: function(fill){
			// summary: sets a fill object
			//	(the default implementation simply ignores it)
			// fill: Object
			//	a fill object
			//	(see dojox.gfx.defaultLinearGradient,
			//	dojox.gfx.defaultRadialGradient,
			//	dojox.gfx.defaultPattern,
			//	or dojo.Color)
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			if(!fill){
				// don't fill
				this.fillStyle = null;
				return this;	// self
			}
			var f = null;
			if(typeof(fill) == "object" && "type" in fill){
				// gradient or pattern
				switch(fill.type){
					case "linear":
						f = g.makeParameters(g.defaultLinearGradient, fill);
						break;
					case "radial":
						f = g.makeParameters(g.defaultRadialGradient, fill);
						break;
					case "pattern":
						f = g.makeParameters(g.defaultPattern, fill);
						break;
				}
			}else{
				// color object
				f = g.normalizeColor(fill);
			}
			this.fillStyle = f;
			return this;	// self
		},
		setStroke: function(stroke){
			// summary: sets a stroke object
			//	(the default implementation simply ignores it)
			// stroke: Object
			//	a stroke object
			//	(see dojox.gfx.defaultStroke)
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			if(!stroke){
				// don't stroke
				this.strokeStyle = null;
				return this;	// self
			}
			// normalize the stroke
			if(typeof stroke == "string" || lang.isArray(stroke) || stroke instanceof Color){
				stroke = {color: stroke};
			}
			var s = this.strokeStyle = g.makeParameters(g.defaultStroke, stroke);
			s.color = g.normalizeColor(s.color);
			return this;	// self
		},
		setTransform: function(matrix){
			// summary: sets a transformation matrix
			// matrix: dojox.gfx.Matrix2D
			//	a matrix or a matrix-like object
			//	(see an argument of dojox.gfx.Matrix2D
			//	constructor for a list of acceptable arguments)
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			this.matrix = matrixLib.clone(matrix ? matrixLib.normalize(matrix) : matrixLib.identity);
			return this._applyTransform();	// self
		},
	
		_applyTransform: function(){
			// summary: physically sets a matrix
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			return this;	// self
		},
	
		// z-index
	
		moveToFront: function(){
			// summary: moves a shape to front of its parent's list of shapes
			var p = this.getParent();
			if(p){
				p._moveChildToFront(this);
				this._moveToFront();	// execute renderer-specific action
			}
			return this;	// self
		},
		moveToBack: function(){
			// summary: moves a shape to back of its parent's list of shapes
			var p = this.getParent();
			if(p){
				p._moveChildToBack(this);
				this._moveToBack();	// execute renderer-specific action
			}
			return this;
		},
		_moveToFront: function(){
			// summary: renderer-specific hook, see dojox.gfx.shape.Shape.moveToFront()
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
		},
		_moveToBack: function(){
			// summary: renderer-specific hook, see dojox.gfx.shape.Shape.moveToFront()
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
		},
	
		// apply left & right transformation
	
		applyRightTransform: function(matrix){
			// summary: multiplies the existing matrix with an argument on right side
			//	(this.matrix * matrix)
			// matrix: dojox.gfx.Matrix2D
			//	a matrix or a matrix-like object
			//	(see an argument of dojox.gfx.Matrix2D
			//	constructor for a list of acceptable arguments)
			return matrix ? this.setTransform([this.matrix, matrix]) : this;	// self
		},
		applyLeftTransform: function(matrix){
			// summary: multiplies the existing matrix with an argument on left side
			//	(matrix * this.matrix)
			// matrix: dojox.gfx.Matrix2D
			//	a matrix or a matrix-like object
			//	(see an argument of dojox.gfx.Matrix2D
			//	constructor for a list of acceptable arguments)
			return matrix ? this.setTransform([matrix, this.matrix]) : this;	// self
		},
		applyTransform: function(matrix){
			// summary: a shortcut for dojox.gfx.Shape.applyRightTransform
			// matrix: dojox.gfx.Matrix2D
			//	a matrix or a matrix-like object
			//	(see an argument of dojox.gfx.Matrix2D
			//	constructor for a list of acceptable arguments)
			return matrix ? this.setTransform([this.matrix, matrix]) : this;	// self
		},
	
		// virtual group methods
	
		removeShape: function(silently){
			// summary: removes the shape from its parent's list of shapes
			// silently: Boolean
			// 		if true, do not redraw a picture yet
			if(this.parent){
				this.parent.remove(this, silently);
			}
			return this;	// self
		},
		_setParent: function(parent, matrix){
			// summary: sets a parent
			// parent: Object
			//	a parent or null
			//	(see dojox.gfx.Surface,
			//	dojox.gfx.shape.VirtualGroup,
			//	or dojox.gfx.Group)
			// matrix: dojox.gfx.Matrix2D
			//	a 2D matrix or a matrix-like object
			this.parent = parent;
			return this._updateParentMatrix(matrix);	// self
		},
		_updateParentMatrix: function(matrix){
			// summary: updates the parent matrix with new matrix
			// matrix: dojox.gfx.Matrix2D
			//	a 2D matrix or a matrix-like object
			this.parentMatrix = matrix ? matrixLib.clone(matrix) : null;
			return this._applyTransform();	// self
		},
		_getRealMatrix: function(){
			// summary: returns the cumulative ('real') transformation matrix
			//	by combining the shape's matrix with its parent's matrix
			var m = this.matrix;
			var p = this.parent;
			while(p){
				if(p.matrix){
					m = matrixLib.multiply(p.matrix, m);
				}
				p = p.parent;
			}
			return m;	// dojox.gfx.Matrix2D
		}
	});
	
	shape._eventsProcessing = {
		connect: function(name, object, method){
			// summary: connects a handler to an event on this shape
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
			// redirect to fixCallback to normalize events and add the gfxTarget to the event. The latter
			// is done by dojox.gfx.fixTarget which is defined by each renderer
			return events.connect(this.getEventSource(), name, shape.fixCallback(this, g.fixTarget, object, method));
			
		},
		disconnect: function(token){
			// summary: connects a handler by token from an event on this shape
			// COULD BE RE-IMPLEMENTED BY THE RENDERER!
	
			events.disconnect(token);
		}
	};
	
	shape.fixCallback = function(gfxElement, fixFunction, scope, method){
		//  summary:
		//      Wraps the callback to allow for tests and event normalization
		//      before it gets invoked. This is where 'fixTarget' is invoked.
		//  gfxElement: Object
		//      The GFX object that triggers the action (ex.: 
		//      dojox.gfx.Surface and dojox.gfx.Shape). A new event property
		//      'gfxTarget' is added to the event to reference this object.
		//      for easy manipulation of GFX objects by the event handlers.
		//  fixFunction: Function
		//      The function that implements the logic to set the 'gfxTarget'
		//      property to the event. It should be 'dojox.gfx.fixTarget' for
		//      most of the cases
		//  scope: Object
		//      Optional. The scope to be used when invoking 'method'. If
		//      omitted, a global scope is used.
		//  method: Function|String
		//      The original callback to be invoked.
		if(!method){
			method = scope;
			scope = null;
		}
		if(lang.isString(method)){
			scope = scope || win.global;
			if(!scope[method]){ throw(['dojox.gfx.shape.fixCallback: scope["', method, '"] is null (scope="', scope, '")'].join('')); }
			return function(e){  
				return fixFunction(e,gfxElement) ? scope[method].apply(scope, arguments || []) : undefined; }; // Function
		}
		return !scope 
			? function(e){ 
				return fixFunction(e,gfxElement) ? method.apply(scope, arguments) : undefined; } 
			: function(e){ 
				return fixFunction(e,gfxElement) ? method.apply(scope, arguments || []) : undefined; }; // Function
	};
	lang.extend(shape.Shape, shape._eventsProcessing);
	
	shape.Container = {
		// summary: a container of shapes, which can be used
		//	as a foundation for renderer-specific groups, or as a way
		//	to logically group shapes (e.g, to propagate matricies)
	
		_init: function() {
			// children: Array: a list of children
			this.children = [];
		},
	
		// group management
	
		openBatch: function() {
			// summary: starts a new batch, subsequent new child shapes will be held in
			//	the batch instead of appending to the container directly
		},
		closeBatch: function() {
			// summary: submits the current batch, append all pending child shapes to DOM
		},
		add: function(shape){
			// summary: adds a shape to the list
			// shape: dojox.gfx.Shape
			//		the shape to add to the list
			var oldParent = shape.getParent();
			if(oldParent){
				oldParent.remove(shape, true);
			}
			this.children.push(shape);
			return shape._setParent(this, this._getRealMatrix());	// self
		},
		remove: function(shape, silently){
			// summary: removes a shape from the list
			//	shape: dojox.gfx.shape.Shape
			//		the shape to remove
			// silently: Boolean
			//		if true, do not redraw a picture yet
			for(var i = 0; i < this.children.length; ++i){
				if(this.children[i] == shape){
					if(silently){
						// skip for now
					}else{
						shape.parent = null;
						shape.parentMatrix = null;
					}
					this.children.splice(i, 1);
					break;
				}
			}
			return this;	// self
		},
		clear: function(){
			// summary: removes all shapes from a group/surface
			var shape;
			for(var i = 0; i < this.children.length;++i){
				shape = this.children[i];
				shape.parent = null;
				shape.parentMatrix = null;
			}
			this.children = [];
			return this;	// self
		},
	
		// moving child nodes
	
		_moveChildToFront: function(shape){
			// summary: moves a shape to front of the list of shapes
			//	shape: dojox.gfx.shape.Shape
			//		one of the child shapes to move to the front
			for(var i = 0; i < this.children.length; ++i){
				if(this.children[i] == shape){
					this.children.splice(i, 1);
					this.children.push(shape);
					break;
				}
			}
			return this;	// self
		},
		_moveChildToBack: function(shape){
			// summary: moves a shape to back of the list of shapes
			//	shape: dojox.gfx.shape.Shape
			//		one of the child shapes to move to the front
			for(var i = 0; i < this.children.length; ++i){
				if(this.children[i] == shape){
					this.children.splice(i, 1);
					this.children.unshift(shape);
					break;
				}
			}
			return this;	// self
		}
	};
	
	declare("dojox.gfx.shape.Surface", null, {
		// summary: a surface object to be used for drawings
		constructor: function(){
			// underlying node
			this.rawNode = null;
			// the parent node
			this._parent = null;
			// the list of DOM nodes to be deleted in the case of destruction
			this._nodes = [];
			// the list of events to be detached in the case of destruction
			this._events = [];
		},
		destroy: function(){
			// summary: destroy all relevant external resources and release all
			//	external references to make this object garbage-collectible
			arr.forEach(this._nodes, domConstruct.destroy);
			this._nodes = [];
			arr.forEach(this._events, events.disconnect);
			this._events = [];
			this.rawNode = null;	// recycle it in _nodes, if it needs to be recycled
			if(has("ie")){
				while(this._parent.lastChild){
					domConstruct.destroy(this._parent.lastChild);
				}
			}else{
				this._parent.innerHTML = "";
			}
			this._parent = null;
		},
		getEventSource: function(){
			// summary: returns a node, which can be used to attach event listeners
			return this.rawNode; // Node
		},
		_getRealMatrix: function(){
			// summary: always returns the identity matrix
			return null;	// dojox.gfx.Matrix2D
		},
		isLoaded: true,
		onLoad: function(/*dojox.gfx.Surface*/ surface){
			// summary: local event, fired once when the surface is created
			// asynchronously, used only when isLoaded is false, required
			// only for Silverlight.
		},
		whenLoaded: function(/*Object|Null*/ context, /*Function|String*/ method){
			var f = lang.hitch(context, method);
			if(this.isLoaded){
				f(this);
			}else{
				var h = events.connect(this, "onLoad", function(surface){
					events.disconnect(h);
					f(surface);
				});
			}
		}
	});
	
	lang.extend(shape.Surface, shape._eventsProcessing);
	
	declare("dojox.gfx.Point", null, {
		// summary: a hypothetical 2D point to be used for drawings - {x, y}
		// description: This object is defined for documentation purposes.
		//	You should use the naked object instead: {x: 1, y: 2}.
	});
	
	declare("dojox.gfx.Rectangle", null, {
		// summary: a hypothetical rectangle - {x, y, width, height}
		// description: This object is defined for documentation purposes.
		//	You should use the naked object instead: {x: 1, y: 2, width: 100, height: 200}.
	});
	
	declare("dojox.gfx.shape.Rect", shape.Shape, {
		// summary: a generic rectangle
		constructor: function(rawNode){
			// rawNode: Node
			//		The underlying graphics system object (typically a DOM Node)
			this.shape = g.getDefault("Rect");
			this.rawNode = rawNode;
		},
		getBoundingBox: function(){
			// summary: returns the bounding box (its shape in this case)
			return this.shape;	// dojox.gfx.Rectangle
		}
	});
	
	declare("dojox.gfx.shape.Ellipse", shape.Shape, {
		// summary: a generic ellipse
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.shape = g.getDefault("Ellipse");
			this.rawNode = rawNode;
		},
		getBoundingBox: function(){
			// summary: returns the bounding box
			if(!this.bbox){
				var shape = this.shape;
				this.bbox = {x: shape.cx - shape.rx, y: shape.cy - shape.ry,
					width: 2 * shape.rx, height: 2 * shape.ry};
			}
			return this.bbox;	// dojox.gfx.Rectangle
		}
	});
	
	declare("dojox.gfx.shape.Circle", shape.Shape, {
		// summary: a generic circle
		//	(this is a helper object, which is defined for convenience)
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.shape = g.getDefault("Circle");
			this.rawNode = rawNode;
		},
		getBoundingBox: function(){
			// summary: returns the bounding box
			if(!this.bbox){
				var shape = this.shape;
				this.bbox = {x: shape.cx - shape.r, y: shape.cy - shape.r,
					width: 2 * shape.r, height: 2 * shape.r};
			}
			return this.bbox;	// dojox.gfx.Rectangle
		}
	});
	
	declare("dojox.gfx.shape.Line", shape.Shape, {
		// summary: a generic line
		//	(this is a helper object, which is defined for convenience)
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.shape = g.getDefault("Line");
			this.rawNode = rawNode;
		},
		getBoundingBox: function(){
			// summary: returns the bounding box
			if(!this.bbox){
				var shape = this.shape;
				this.bbox = {
					x:		Math.min(shape.x1, shape.x2),
					y:		Math.min(shape.y1, shape.y2),
					width:	Math.abs(shape.x2 - shape.x1),
					height:	Math.abs(shape.y2 - shape.y1)
				};
			}
			return this.bbox;	// dojox.gfx.Rectangle
		}
	});
	
	declare("dojox.gfx.shape.Polyline", shape.Shape, {
		// summary: a generic polyline/polygon
		//	(this is a helper object, which is defined for convenience)
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.shape = g.getDefault("Polyline");
			this.rawNode = rawNode;
		},
		setShape: function(points, closed){
			// summary: sets a polyline/polygon shape object
			// points: Object
			//		a polyline/polygon shape object
			// closed: Boolean
			//		close the polyline to make a polygon
			if(points && points instanceof Array){
				// points: Array: an array of points
				this.inherited(arguments, [{points: points}]);
				if(closed && this.shape.points.length){
					this.shape.points.push(this.shape.points[0]);
				}
			}else{
				this.inherited(arguments, [points]);
			}
			return this;	// self
		},
		_normalizePoints: function(){
			// summary: normalize points to array of {x:number, y:number}
			var p = this.shape.points, l = p && p.length;
			if(l && typeof p[0] == "number"){
				var points = [];
				for(var i = 0; i < l; i += 2){
					points.push({x: p[i], y: p[i + 1]});
				}
				this.shape.points = points;
			}
		},
		getBoundingBox: function(){
			// summary: returns the bounding box
			if(!this.bbox && this.shape.points.length){
				var p = this.shape.points;
				var l = p.length;
				var t = p[0];
				var bbox = {l: t.x, t: t.y, r: t.x, b: t.y};
				for(var i = 1; i < l; ++i){
					t = p[i];
					if(bbox.l > t.x) bbox.l = t.x;
					if(bbox.r < t.x) bbox.r = t.x;
					if(bbox.t > t.y) bbox.t = t.y;
					if(bbox.b < t.y) bbox.b = t.y;
				}
				this.bbox = {
					x:		bbox.l,
					y:		bbox.t,
					width:	bbox.r - bbox.l,
					height:	bbox.b - bbox.t
				};
			}
			return this.bbox;	// dojox.gfx.Rectangle
		}
	});
	
	declare("dojox.gfx.shape.Image", shape.Shape, {
		// summary: a generic image
		//	(this is a helper object, which is defined for convenience)
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.shape = g.getDefault("Image");
			this.rawNode = rawNode;
		},
		getBoundingBox: function(){
			// summary: returns the bounding box (its shape in this case)
			return this.shape;	// dojox.gfx.Rectangle
		},
		setStroke: function(){
			// summary: ignore setting a stroke style
			return this;	// self
		},
		setFill: function(){
			// summary: ignore setting a fill style
			return this;	// self
		}
	});
	
	declare("dojox.gfx.shape.Text", shape.Shape, {
		// summary: a generic text
		constructor: function(rawNode){
			// rawNode: Node
			//		a DOM Node
			this.fontStyle = null;
			this.shape = g.getDefault("Text");
			this.rawNode = rawNode;
		},
		getFont: function(){
			// summary: returns the current font object or null
			return this.fontStyle;	// Object
		},
		setFont: function(newFont){
			// summary: sets a font for text
			// newFont: Object
			//		a font object (see dojox.gfx.defaultFont) or a font string
			this.fontStyle = typeof newFont == "string" ? g.splitFontString(newFont) :
				g.makeParameters(g.defaultFont, newFont);
			this._setFont();
			return this;	// self
		}
	});
	
	shape.Creator = {
		// summary: shape creators
		createShape: function(shape){
			// summary: creates a shape object based on its type; it is meant to be used
			//	by group-like objects
			// shape: Object
			//		a shape descriptor object
			switch(shape.type){
				case g.defaultPath.type:		return this.createPath(shape);
				case g.defaultRect.type:		return this.createRect(shape);
				case g.defaultCircle.type:	return this.createCircle(shape);
				case g.defaultEllipse.type:	return this.createEllipse(shape);
				case g.defaultLine.type:		return this.createLine(shape);
				case g.defaultPolyline.type:	return this.createPolyline(shape);
				case g.defaultImage.type:		return this.createImage(shape);
				case g.defaultText.type:		return this.createText(shape);
				case g.defaultTextPath.type:	return this.createTextPath(shape);
			}
			return null;
		},
		createGroup: function(){
			// summary: creates a group shape
			return this.createObject(g.Group);	// dojox.gfx.Group
		},
		createRect: function(rect){
			// summary: creates a rectangle shape
			// rect: Object
			//		a path object (see dojox.gfx.defaultRect)
			return this.createObject(g.Rect, rect);	// dojox.gfx.Rect
		},
		createEllipse: function(ellipse){
			// summary: creates an ellipse shape
			// ellipse: Object
			//		an ellipse object (see dojox.gfx.defaultEllipse)
			return this.createObject(g.Ellipse, ellipse);	// dojox.gfx.Ellipse
		},
		createCircle: function(circle){
			// summary: creates a circle shape
			// circle: Object
			//		a circle object (see dojox.gfx.defaultCircle)
			return this.createObject(g.Circle, circle);	// dojox.gfx.Circle
		},
		createLine: function(line){
			// summary: creates a line shape
			// line: Object
			//		a line object (see dojox.gfx.defaultLine)
			return this.createObject(g.Line, line);	// dojox.gfx.Line
		},
		createPolyline: function(points){
			// summary: creates a polyline/polygon shape
			// points: Object
			//		a points object (see dojox.gfx.defaultPolyline)
			//		or an Array of points
			return this.createObject(g.Polyline, points);	// dojox.gfx.Polyline
		},
		createImage: function(image){
			// summary: creates a image shape
			// image: Object
			//		an image object (see dojox.gfx.defaultImage)
			return this.createObject(g.Image, image);	// dojox.gfx.Image
		},
		createText: function(text){
			// summary: creates a text shape
			// text: Object
			//		a text object (see dojox.gfx.defaultText)
			return this.createObject(g.Text, text);	// dojox.gfx.Text
		},
		createPath: function(path){
			// summary: creates a path shape
			// path: Object
			//		a path object (see dojox.gfx.defaultPath)
			return this.createObject(g.Path, path);	// dojox.gfx.Path
		},
		createTextPath: function(text){
			// summary: creates a text shape
			// text: Object
			//		a textpath object (see dojox.gfx.defaultTextPath)
			return this.createObject(g.TextPath, {}).setText(text);	// dojox.gfx.TextPath
		},
		createObject: function(shapeType, rawShape){
			// summary: creates an instance of the passed shapeType class
			// SHOULD BE RE-IMPLEMENTED BY THE RENDERER!
			// shapeType: Function
			//		a class constructor to create an instance of
			// rawShape: Object 
			//		properties to be passed in to the classes 'setShape' method
	
			return null;	// dojox.gfx.Shape
		}
	};
	
	return shape;
});


},
'dojox/charting/scaler/linear':function(){
define("dojox/charting/scaler/linear", ["dojo/_base/lang", "./common"], 
	function(lang, common){
	var linear = lang.getObject("dojox.charting.scaler.linear", true);
	
	var deltaLimit = 3,	// pixels
		findString = common.findString,
		getLabel = common.getNumericLabel;
	
	var calcTicks = function(min, max, kwArgs, majorTick, minorTick, microTick, span){
		kwArgs = lang.delegate(kwArgs);
		if(!majorTick){
			if(kwArgs.fixUpper == "major"){ kwArgs.fixUpper = "minor"; }
			if(kwArgs.fixLower == "major"){ kwArgs.fixLower = "minor"; }
		}
		if(!minorTick){
			if(kwArgs.fixUpper == "minor"){ kwArgs.fixUpper = "micro"; }
			if(kwArgs.fixLower == "minor"){ kwArgs.fixLower = "micro"; }
		}
		if(!microTick){
			if(kwArgs.fixUpper == "micro"){ kwArgs.fixUpper = "none"; }
			if(kwArgs.fixLower == "micro"){ kwArgs.fixLower = "none"; }
		}
		var lowerBound = findString(kwArgs.fixLower, ["major"]) ?
				Math.floor(kwArgs.min / majorTick) * majorTick :
					findString(kwArgs.fixLower, ["minor"]) ?
						Math.floor(kwArgs.min / minorTick) * minorTick :
							findString(kwArgs.fixLower, ["micro"]) ?
								Math.floor(kwArgs.min / microTick) * microTick : kwArgs.min,
			upperBound = findString(kwArgs.fixUpper, ["major"]) ?
				Math.ceil(kwArgs.max / majorTick) * majorTick :
					findString(kwArgs.fixUpper, ["minor"]) ?
						Math.ceil(kwArgs.max / minorTick) * minorTick :
							findString(kwArgs.fixUpper, ["micro"]) ?
								Math.ceil(kwArgs.max / microTick) * microTick : kwArgs.max;
								
		if(kwArgs.useMin){ min = lowerBound; }
		if(kwArgs.useMax){ max = upperBound; }
		
		var majorStart = (!majorTick || kwArgs.useMin && findString(kwArgs.fixLower, ["major"])) ?
				min : Math.ceil(min / majorTick) * majorTick,
			minorStart = (!minorTick || kwArgs.useMin && findString(kwArgs.fixLower, ["major", "minor"])) ?
				min : Math.ceil(min / minorTick) * minorTick,
			microStart = (! microTick || kwArgs.useMin && findString(kwArgs.fixLower, ["major", "minor", "micro"])) ?
				min : Math.ceil(min / microTick) * microTick,
			majorCount = !majorTick ? 0 : (kwArgs.useMax && findString(kwArgs.fixUpper, ["major"]) ?
				Math.round((max - majorStart) / majorTick) :
				Math.floor((max - majorStart) / majorTick)) + 1,
			minorCount = !minorTick ? 0 : (kwArgs.useMax && findString(kwArgs.fixUpper, ["major", "minor"]) ?
				Math.round((max - minorStart) / minorTick) :
				Math.floor((max - minorStart) / minorTick)) + 1,
			microCount = !microTick ? 0 : (kwArgs.useMax && findString(kwArgs.fixUpper, ["major", "minor", "micro"]) ?
				Math.round((max - microStart) / microTick) :
				Math.floor((max - microStart) / microTick)) + 1,
			minorPerMajor  = minorTick ? Math.round(majorTick / minorTick) : 0,
			microPerMinor  = microTick ? Math.round(minorTick / microTick) : 0,
			majorPrecision = majorTick ? Math.floor(Math.log(majorTick) / Math.LN10) : 0,
			minorPrecision = minorTick ? Math.floor(Math.log(minorTick) / Math.LN10) : 0,
			scale = span / (max - min);
		if(!isFinite(scale)){ scale = 1; }
		
		return {
			bounds: {
				lower:	lowerBound,
				upper:	upperBound,
				from:	min,
				to:		max,
				scale:	scale,
				span:	span
			},
			major: {
				tick:	majorTick,
				start:	majorStart,
				count:	majorCount,
				prec:	majorPrecision
			},
			minor: {
				tick:	minorTick,
				start:	minorStart,
				count:	minorCount,
				prec:	minorPrecision
			},
			micro: {
				tick:	microTick,
				start:	microStart,
				count:	microCount,
				prec:	0
			},
			minorPerMajor:	minorPerMajor,
			microPerMinor:	microPerMinor,
			scaler:			linear
		};
	};
	
	return lang.mixin(linear, {
		buildScaler: function(/*Number*/ min, /*Number*/ max, /*Number*/ span, /*Object*/ kwArgs){
			var h = {fixUpper: "none", fixLower: "none", natural: false};
			if(kwArgs){
				if("fixUpper" in kwArgs){ h.fixUpper = String(kwArgs.fixUpper); }
				if("fixLower" in kwArgs){ h.fixLower = String(kwArgs.fixLower); }
				if("natural"  in kwArgs){ h.natural  = Boolean(kwArgs.natural); }
			}
			
			// update bounds
			if("min" in kwArgs){ min = kwArgs.min; }
			if("max" in kwArgs){ max = kwArgs.max; }
			if(kwArgs.includeZero){
				if(min > 0){ min = 0; }
				if(max < 0){ max = 0; }
			}
			h.min = min;
			h.useMin = true;
			h.max = max;
			h.useMax = true;
			
			if("from" in kwArgs){
				min = kwArgs.from;
				h.useMin = false;
			}
			if("to" in kwArgs){
				max = kwArgs.to;
				h.useMax = false;
			}
			
			// check for erroneous condition
			if(max <= min){
				return calcTicks(min, max, h, 0, 0, 0, span);	// Object
			}
			
			var mag = Math.floor(Math.log(max - min) / Math.LN10),
				major = kwArgs && ("majorTickStep" in kwArgs) ? kwArgs.majorTickStep : Math.pow(10, mag),
				minor = 0, micro = 0, ticks;
				
			// calculate minor ticks
			if(kwArgs && ("minorTickStep" in kwArgs)){
				minor = kwArgs.minorTickStep;
			}else{
				do{
					minor = major / 10;
					if(!h.natural || minor > 0.9){
						ticks = calcTicks(min, max, h, major, minor, 0, span);
						if(ticks.bounds.scale * ticks.minor.tick > deltaLimit){ break; }
					}
					minor = major / 5;
					if(!h.natural || minor > 0.9){
						ticks = calcTicks(min, max, h, major, minor, 0, span);
						if(ticks.bounds.scale * ticks.minor.tick > deltaLimit){ break; }
					}
					minor = major / 2;
					if(!h.natural || minor > 0.9){
						ticks = calcTicks(min, max, h, major, minor, 0, span);
						if(ticks.bounds.scale * ticks.minor.tick > deltaLimit){ break; }
					}
					return calcTicks(min, max, h, major, 0, 0, span);	// Object
				}while(false);
			}
	
			// calculate micro ticks
			if(kwArgs && ("microTickStep" in kwArgs)){
				micro = kwArgs.microTickStep;
				ticks = calcTicks(min, max, h, major, minor, micro, span);
			}else{
				do{
					micro = minor / 10;
					if(!h.natural || micro > 0.9){
						ticks = calcTicks(min, max, h, major, minor, micro, span);
						if(ticks.bounds.scale * ticks.micro.tick > deltaLimit){ break; }
					}
					micro = minor / 5;
					if(!h.natural || micro > 0.9){
						ticks = calcTicks(min, max, h, major, minor, micro, span);
						if(ticks.bounds.scale * ticks.micro.tick > deltaLimit){ break; }
					}
					micro = minor / 2;
					if(!h.natural || micro > 0.9){
						ticks = calcTicks(min, max, h, major, minor, micro, span);
						if(ticks.bounds.scale * ticks.micro.tick > deltaLimit){ break; }
					}
					micro = 0;
				}while(false);
			}
	
			return micro ? ticks : calcTicks(min, max, h, major, minor, 0, span);	// Object
		},
		buildTicks: function(/*Object*/ scaler, /*Object*/ kwArgs){
			var step, next, tick,
				nextMajor = scaler.major.start,
				nextMinor = scaler.minor.start,
				nextMicro = scaler.micro.start;
			if(kwArgs.microTicks && scaler.micro.tick){
				step = scaler.micro.tick, next = nextMicro;
			}else if(kwArgs.minorTicks && scaler.minor.tick){
				step = scaler.minor.tick, next = nextMinor;
			}else if(scaler.major.tick){
				step = scaler.major.tick, next = nextMajor;
			}else{
				// no ticks
				return null;
			}
			// make sure that we have finite bounds
			var revScale = 1 / scaler.bounds.scale;
			if(scaler.bounds.to <= scaler.bounds.from || isNaN(revScale) || !isFinite(revScale) ||
					step <= 0 || isNaN(step) || !isFinite(step)){
				// no ticks
				return null;
			}
			// loop over all ticks
			var majorTicks = [], minorTicks = [], microTicks = [];
			while(next <= scaler.bounds.to + revScale){
				if(Math.abs(nextMajor - next) < step / 2){
					// major tick
					tick = {value: nextMajor};
					if(kwArgs.majorLabels){
						tick.label = getLabel(nextMajor, scaler.major.prec, kwArgs);
					}
					majorTicks.push(tick);
					nextMajor += scaler.major.tick;
					nextMinor += scaler.minor.tick;
					nextMicro += scaler.micro.tick;
				}else if(Math.abs(nextMinor - next) < step / 2){
					// minor tick
					if(kwArgs.minorTicks){
						tick = {value: nextMinor};
						if(kwArgs.minorLabels && (scaler.minMinorStep <= scaler.minor.tick * scaler.bounds.scale)){
							tick.label = getLabel(nextMinor, scaler.minor.prec, kwArgs);
						}
						minorTicks.push(tick);
					}
					nextMinor += scaler.minor.tick;
					nextMicro += scaler.micro.tick;
				}else{
					// micro tick
					if(kwArgs.microTicks){
						microTicks.push({value: nextMicro});
					}
					nextMicro += scaler.micro.tick;
				}
				next += step;
			}
			return {major: majorTicks, minor: minorTicks, micro: microTicks};	// Object
		},
		getTransformerFromModel: function(/*Object*/ scaler){
			var offset = scaler.bounds.from, scale = scaler.bounds.scale;
			return function(x){ return (x - offset) * scale; };	// Function
		},
		getTransformerFromPlot: function(/*Object*/ scaler){
			var offset = scaler.bounds.from, scale = scaler.bounds.scale;
			return function(x){ return x / scale + offset; };	// Function
		}
	});
});

},
'dojox/gfx/renderer':function(){
define("dojox/gfx/renderer", ["./_base","dojo/_base/lang", "dojo/_base/sniff", "dojo/_base/window", "dojo/_base/config"],
  function(g, lang, has, win, config){
  //>> noBuildResolver
/*=====
	dojox.gfx.renderer = {
		// summary:
		//		This module is an AMD loader plugin that loads the appropriate graphics renderer
		//		implementation based on detected environment and current configuration settings.
	};
  =====*/
	var currentRenderer = null;
	return {
		load: function(id, require, load){
			if(currentRenderer && id != "force"){
				load(currentRenderer);
				return;
			}
			var renderer = config.forceGfxRenderer,
				renderers = !renderer && (lang.isString(config.gfxRenderer) ?
					config.gfxRenderer : "svg,vml,canvas,silverlight").split(","),
				silverlightObject, silverlightFlag;

			while(!renderer && renderers.length){
				switch(renderers.shift()){
					case "svg":
						// the next test is from https://github.com/phiggins42/has.js
						if("SVGAngle" in win.global){
							renderer = "svg";
						}
						break;
					case "vml":
						if(has("ie")){
							renderer = "vml";
						}
						break;
					case "silverlight":
						try{
							if(has("ie")){
								silverlightObject = new ActiveXObject("AgControl.AgControl");
								if(silverlightObject && silverlightObject.IsVersionSupported("1.0")){
									silverlightFlag = true;
								}
							}else{
								if(navigator.plugins["Silverlight Plug-In"]){
									silverlightFlag = true;
								}
							}
						}catch(e){
							silverlightFlag = false;
						}finally{
							silverlightObject = null;
						}
						if(silverlightFlag){
							renderer = "silverlight";
						}
						break;
					case "canvas":
						if(win.global.CanvasRenderingContext2D){
							renderer = "canvas";
						}
						break;
				}
			}

			if (renderer === 'canvas' && config.canvasEvents !== false) {
				renderer = "canvasWithEvents";
			}

			if(config.isDebug){
				console.log("gfx renderer = " + renderer);
			}

			function loadRenderer(){
				require(["dojox/gfx/" + renderer], function(module){
					g.renderer = renderer;
					// memorize the renderer module
					currentRenderer = module;
					// now load it
					load(module);
				});
			}
			if(renderer == "svg" && typeof window.svgweb != "undefined"){
				window.svgweb.addOnLoad(loadRenderer);
			}else{
				loadRenderer();
			}
		}
	};
});

},
'dojo/io-query':function(){
define(["./_base/lang"], function(lang){
	// module:
	//		dojo/io-query
	// summary:
	//		This module defines query string processing functions.

    var backstop = {};

    function objectToQuery(/*Object*/ map){
        // summary:
        //		takes a name/value mapping object and returns a string representing
        //		a URL-encoded version of that object.
        // example:
        //		this object:
        //
        //	|	{
        //	|		blah: "blah",
        //	|		multi: [
        //	|			"thud",
        //	|			"thonk"
        //	|		]
        //	|	};
        //
        // yields the following query string:
        //
        //	|	"blah=blah&multi=thud&multi=thonk"

        // FIXME: need to implement encodeAscii!!
        var enc = encodeURIComponent, pairs = [];
        for(var name in map){
            var value = map[name];
            if(value != backstop[name]){
                var assign = enc(name) + "=";
                if(lang.isArray(value)){
                    for(var i = 0, l = value.length; i < l; ++i){
                        pairs.push(assign + enc(value[i]));
                    }
                }else{
                    pairs.push(assign + enc(value));
                }
            }
        }
        return pairs.join("&"); // String
    }

    function queryToObject(/*String*/ str){
        // summary:
        //		Create an object representing a de-serialized query section of a
        //		URL. Query keys with multiple values are returned in an array.
        //
        // example:
        //		This string:
        //
        //	|		"foo=bar&foo=baz&thinger=%20spaces%20=blah&zonk=blarg&"
        //
        //		results in this object structure:
        //
        //	|		{
        //	|			foo: [ "bar", "baz" ],
        //	|			thinger: " spaces =blah",
        //	|			zonk: "blarg"
        //	|		}
        //
        //		Note that spaces and other urlencoded entities are correctly
        //		handled.

        // FIXME: should we grab the URL string if we're not passed one?
        var dec = decodeURIComponent, qp = str.split("&"), ret = {}, name, val;
        for(var i = 0, l = qp.length, item; i < l; ++i){
            item = qp[i];
            if(item.length){
                var s = item.indexOf("=");
                if(s < 0){
                    name = dec(item);
                    val = "";
                }else{
                    name = dec(item.slice(0, s));
                    val  = dec(item.slice(s + 1));
                }
                if(typeof ret[name] == "string"){ // inline'd type check
                    ret[name] = [ret[name]];
                }

                if(lang.isArray(ret[name])){
                    ret[name].push(val);
                }else{
                    ret[name] = val;
                }
            }
        }
        return ret; // Object
    }

    return {
        objectToQuery: objectToQuery,
        queryToObject: queryToObject
    };
});
},
'dojox/lang/functional':function(){
define("dojox/lang/functional", ["./functional/lambda", "./functional/array", "./functional/object"], function(df){
	return df;
});

},
'dojox/gfx/path':function(){
define("dojox/gfx/path", ["./_base", "dojo/_base/lang","dojo/_base/declare", "./matrix", "./shape"], 
  function(g, lang, declare, matrix, shapeLib){
/*===== 
	dojox.gfx.path = {
		// summary:
		//		This module contains the core graphics Path API.
		//		Path command format follows the W3C SVG 1.0 Path api.
	};
	g = dojox.gfx;
	shape.Shape = dojox.gfx.shape.Shape;
  =====*/

	var path = g.path = {};
	var Path = declare("dojox.gfx.path.Path", shapeLib.Shape, {
		// summary: a generalized path shape

		constructor: function(rawNode){
			// summary: a path constructor
			// rawNode: Node
			//		a DOM node to be used by this path object
			this.shape = lang.clone(g.defaultPath);
			this.segments = [];
			this.tbbox = null;
			this.absolute = true;
			this.last = {};
			this.rawNode = rawNode;
			this.segmented = false;
		},

		// mode manipulations
		setAbsoluteMode: function(mode){
			// summary: sets an absolute or relative mode for path points
			// mode: Boolean
			//		true/false or "absolute"/"relative" to specify the mode
			this._confirmSegmented();
			this.absolute = typeof mode == "string" ? (mode == "absolute") : mode;
			return this; // self
		},
		getAbsoluteMode: function(){
			// summary: returns a current value of the absolute mode
			this._confirmSegmented();
			return this.absolute; // Boolean
		},

		getBoundingBox: function(){
			// summary: returns the bounding box {x, y, width, height} or null
			this._confirmSegmented();
			return (this.bbox && ("l" in this.bbox)) ? {x: this.bbox.l, y: this.bbox.t, width: this.bbox.r - this.bbox.l, height: this.bbox.b - this.bbox.t} : null; // dojox.gfx.Rectangle
		},

		_getRealBBox: function(){
			// summary: returns an array of four points or null
			//	four points represent four corners of the untransformed bounding box
			this._confirmSegmented();
			if(this.tbbox){
				return this.tbbox;	// Array
			}
			var bbox = this.bbox, matrix = this._getRealMatrix();
			this.bbox = null;
			for(var i = 0, len = this.segments.length; i < len; ++i){
				this._updateWithSegment(this.segments[i], matrix);
			}
			var t = this.bbox;
			this.bbox = bbox;
			this.tbbox = t ? [
				{x: t.l, y: t.t},
				{x: t.r, y: t.t},
				{x: t.r, y: t.b},
				{x: t.l, y: t.b}
			] : null;
			return this.tbbox;	// Array
		},

		getLastPosition: function(){
			// summary: returns the last point in the path, or null
			this._confirmSegmented();
			return "x" in this.last ? this.last : null; // Object
		},

		_applyTransform: function(){
			this.tbbox = null;
			return this.inherited(arguments);
		},

		// segment interpretation
		_updateBBox: function(x, y, m){
			// summary: updates the bounding box of path with new point
			// x: Number
			//		an x coordinate
			// y: Number
			//		a y coordinate

			if(m){
				var t = matrix.multiplyPoint(m, x, y);
				x = t.x;
				y = t.y;
			}

			// we use {l, b, r, t} representation of a bbox
			if(this.bbox && ("l" in this.bbox)){
				if(this.bbox.l > x) this.bbox.l = x;
				if(this.bbox.r < x) this.bbox.r = x;
				if(this.bbox.t > y) this.bbox.t = y;
				if(this.bbox.b < y) this.bbox.b = y;
			}else{
				this.bbox = {l: x, b: y, r: x, t: y};
			}
		},
		_updateWithSegment: function(segment, matrix){
			// summary: updates the bounding box of path with new segment
			// segment: Object
			//		a segment
			var n = segment.args, l = n.length, i;
			// update internal variables: bbox, absolute, last
			switch(segment.action){
				case "M":
				case "L":
				case "C":
				case "S":
				case "Q":
				case "T":
					for(i = 0; i < l; i += 2){
						this._updateBBox(n[i], n[i + 1], matrix);
					}
					this.last.x = n[l - 2];
					this.last.y = n[l - 1];
					this.absolute = true;
					break;
				case "H":
					for(i = 0; i < l; ++i){
						this._updateBBox(n[i], this.last.y, matrix);
					}
					this.last.x = n[l - 1];
					this.absolute = true;
					break;
				case "V":
					for(i = 0; i < l; ++i){
						this._updateBBox(this.last.x, n[i], matrix);
					}
					this.last.y = n[l - 1];
					this.absolute = true;
					break;
				case "m":
					var start = 0;
					if(!("x" in this.last)){
						this._updateBBox(this.last.x = n[0], this.last.y = n[1], matrix);
						start = 2;
					}
					for(i = start; i < l; i += 2){
						this._updateBBox(this.last.x += n[i], this.last.y += n[i + 1], matrix);
					}
					this.absolute = false;
					break;
				case "l":
				case "t":
					for(i = 0; i < l; i += 2){
						this._updateBBox(this.last.x += n[i], this.last.y += n[i + 1], matrix);
					}
					this.absolute = false;
					break;
				case "h":
					for(i = 0; i < l; ++i){
						this._updateBBox(this.last.x += n[i], this.last.y, matrix);
					}
					this.absolute = false;
					break;
				case "v":
					for(i = 0; i < l; ++i){
						this._updateBBox(this.last.x, this.last.y += n[i], matrix);
					}
					this.absolute = false;
					break;
				case "c":
					for(i = 0; i < l; i += 6){
						this._updateBBox(this.last.x + n[i], this.last.y + n[i + 1], matrix);
						this._updateBBox(this.last.x + n[i + 2], this.last.y + n[i + 3], matrix);
						this._updateBBox(this.last.x += n[i + 4], this.last.y += n[i + 5], matrix);
					}
					this.absolute = false;
					break;
				case "s":
				case "q":
					for(i = 0; i < l; i += 4){
						this._updateBBox(this.last.x + n[i], this.last.y + n[i + 1], matrix);
						this._updateBBox(this.last.x += n[i + 2], this.last.y += n[i + 3], matrix);
					}
					this.absolute = false;
					break;
				case "A":
					for(i = 0; i < l; i += 7){
						this._updateBBox(n[i + 5], n[i + 6], matrix);
					}
					this.last.x = n[l - 2];
					this.last.y = n[l - 1];
					this.absolute = true;
					break;
				case "a":
					for(i = 0; i < l; i += 7){
						this._updateBBox(this.last.x += n[i + 5], this.last.y += n[i + 6], matrix);
					}
					this.absolute = false;
					break;
			}
			// add an SVG path segment
			var path = [segment.action];
			for(i = 0; i < l; ++i){
				path.push(g.formatNumber(n[i], true));
			}
			if(typeof this.shape.path == "string"){
				this.shape.path += path.join("");
			}else{
				Array.prototype.push.apply(this.shape.path, path); //FIXME: why not simple push()?
			}
		},

		// a dictionary, which maps segment type codes to a number of their arguments
		_validSegments: {m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0},

		_pushSegment: function(action, args){
			// summary: adds a segment
			// action: String
			//		valid SVG code for a segment's type
			// args: Array
			//		a list of parameters for this segment
			this.tbbox = null;
			var group = this._validSegments[action.toLowerCase()], segment;
			if(typeof group == "number"){
				if(group){
					if(args.length >= group){
						segment = {action: action, args: args.slice(0, args.length - args.length % group)};
						this.segments.push(segment);
						this._updateWithSegment(segment);
					}
				}else{
					segment = {action: action, args: []};
					this.segments.push(segment);
					this._updateWithSegment(segment);
				}
			}
		},

		_collectArgs: function(array, args){
			// summary: converts an array of arguments to plain numeric values
			// array: Array
			//		an output argument (array of numbers)
			// args: Array
			//		an input argument (can be values of Boolean, Number, dojox.gfx.Point, or an embedded array of them)
			for(var i = 0; i < args.length; ++i){
				var t = args[i];
				if(typeof t == "boolean"){
					array.push(t ? 1 : 0);
				}else if(typeof t == "number"){
					array.push(t);
				}else if(t instanceof Array){
					this._collectArgs(array, t);
				}else if("x" in t && "y" in t){
					array.push(t.x, t.y);
				}
			}
		},

		// segments
		moveTo: function(){
			// summary: forms a move segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "M" : "m", args);
			return this; // self
		},
		lineTo: function(){
			// summary: forms a line segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "L" : "l", args);
			return this; // self
		},
		hLineTo: function(){
			// summary: forms a horizontal line segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "H" : "h", args);
			return this; // self
		},
		vLineTo: function(){
			// summary: forms a vertical line segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "V" : "v", args);
			return this; // self
		},
		curveTo: function(){
			// summary: forms a curve segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "C" : "c", args);
			return this; // self
		},
		smoothCurveTo: function(){
			// summary: forms a smooth curve segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "S" : "s", args);
			return this; // self
		},
		qCurveTo: function(){
			// summary: forms a quadratic curve segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "Q" : "q", args);
			return this; // self
		},
		qSmoothCurveTo: function(){
			// summary: forms a quadratic smooth curve segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "T" : "t", args);
			return this; // self
		},
		arcTo: function(){
			// summary: forms an elliptic arc segment
			this._confirmSegmented();
			var args = [];
			this._collectArgs(args, arguments);
			this._pushSegment(this.absolute ? "A" : "a", args);
			return this; // self
		},
		closePath: function(){
			// summary: closes a path
			this._confirmSegmented();
			this._pushSegment("Z", []);
			return this; // self
		},

		_confirmSegmented: function() {
			if (!this.segmented) {
				var path = this.shape.path;
				// switch to non-updating version of path building
				this.shape.path = [];
				this._setPath(path);
				// switch back to the string path
				this.shape.path = this.shape.path.join("");
				// become segmented
				this.segmented = true;
			}
		},

		// setShape
		_setPath: function(path){
			// summary: forms a path using an SVG path string
			// path: String
			//		an SVG path string
			var p = lang.isArray(path) ? path : path.match(g.pathSvgRegExp);
			this.segments = [];
			this.absolute = true;
			this.bbox = {};
			this.last = {};
			if(!p) return;
			// create segments
			var action = "",	// current action
				args = [],		// current arguments
				l = p.length;
			for(var i = 0; i < l; ++i){
				var t = p[i], x = parseFloat(t);
				if(isNaN(x)){
					if(action){
						this._pushSegment(action, args);
					}
					args = [];
					action = t;
				}else{
					args.push(x);
				}
			}
			this._pushSegment(action, args);
		},
		setShape: function(newShape){
			// summary: forms a path using a shape
			// newShape: Object
			//		an SVG path string or a path object (see dojox.gfx.defaultPath)
			this.inherited(arguments, [typeof newShape == "string" ? {path: newShape} : newShape]);

			this.segmented = false;
			this.segments = [];
			if(!g.lazyPathSegmentation){
				this._confirmSegmented();
			}
			return this; // self
		},

		// useful constant for descendants
		_2PI: Math.PI * 2
	});

	var TextPath = declare("dojox.gfx.path.TextPath", Path, {
		// summary: a generalized TextPath shape

		constructor: function(rawNode){
			// summary: a TextPath shape constructor
			// rawNode: Node
			//		a DOM node to be used by this TextPath object
			if(!("text" in this)){
				this.text = lang.clone(g.defaultTextPath);
			}
			if(!("fontStyle" in this)){
				this.fontStyle = lang.clone(g.defaultFont);
			}
		},
		getText: function(){
			// summary: returns the current text object or null
			return this.text;	// Object
		},
		setText: function(newText){
			// summary: sets a text to be drawn along the path
			this.text = g.makeParameters(this.text,
				typeof newText == "string" ? {text: newText} : newText);
			this._setText();
			return this;	// self
		},
		getFont: function(){
			// summary: returns the current font object or null
			return this.fontStyle;	// Object
		},
		setFont: function(newFont){
			// summary: sets a font for text
			this.fontStyle = typeof newFont == "string" ?
				g.splitFontString(newFont) :
				g.makeParameters(g.defaultFont, newFont);
			this._setFont();
			return this;	// self
		}
	});

	return { // our hash of newly defined objects
		Path: Path,
		TextPath: TextPath
	};
});

},
'dojox/charting/scaler/common':function(){
define("dojox/charting/scaler/common", ["dojo/_base/lang"], function(lang){

	var eq = function(/*Number*/ a, /*Number*/ b){
		// summary: compare two FP numbers for equality
		return Math.abs(a - b) <= 1e-6 * (Math.abs(a) + Math.abs(b));	// Boolean
	};
	
	var common = lang.getObject("dojox.charting.scaler.common", true);
	
	var testedModules = {};

	return lang.mixin(common, {
		doIfLoaded: function(moduleName, ifloaded, ifnotloaded){
			if(testedModules[moduleName] == undefined){
				try{
					testedModules[moduleName] = require(moduleName);
				}catch(e){
					testedModules[moduleName] = null;
				}
			}
			if(testedModules[moduleName]){
				return ifloaded(testedModules[moduleName]);
			}else{
				return ifnotloaded();
			}
		},
		findString: function(/*String*/ val, /*Array*/ text){
			val = val.toLowerCase();
			for(var i = 0; i < text.length; ++i){
				if(val == text[i]){ return true; }
			}
			return false;
		},
		getNumericLabel: function(/*Number*/ number, /*Number*/ precision, /*Object*/ kwArgs){
			var def = "";
			common.doIfLoaded("dojo/number", function(numberLib){
				def = (kwArgs.fixed ? numberLib.format(number, {places : precision < 0 ? -precision : 0}) :
					numberLib.format(number)) || "";
			}, function(){
				def = kwArgs.fixed ? number.toFixed(precision < 0 ? -precision : 0) : number.toString();
			});
			if(kwArgs.labelFunc){
				var r = kwArgs.labelFunc(def, number, precision);
				if(r){ return r; }
				// else fall through to the regular labels search
			}
			if(kwArgs.labels){
				// classic binary search
				var l = kwArgs.labels, lo = 0, hi = l.length;
				while(lo < hi){
					var mid = Math.floor((lo + hi) / 2), val = l[mid].value;
					if(val < number){
						lo = mid + 1;
					}else{
						hi = mid;
					}
				}
				// lets take into account FP errors
				if(lo < l.length && eq(l[lo].value, number)){
					return l[lo].text;
				}
				--lo;
				if(lo >= 0 && lo < l.length && eq(l[lo].value, number)){
					return l[lo].text;
				}
				lo += 2;
				if(lo < l.length && eq(l[lo].value, number)){
					return l[lo].text;
				}
				// otherwise we will produce a number
			}
			return def;
		}
	});
});

},
'dojo/ready':function(){
define(["./_base/kernel", "./has", "require", "./domReady", "./_base/lang"], function(dojo, has, require, domReady, lang) {
	// module:
	//		dojo/ready
	// summary:
	//		This module defines the dojo.ready API.
	//
	// note:
	//		This module should be unnecessary in dojo 2.0
	var
		// truthy if DOMContentLoaded or better (e.g., window.onload fired) has been achieved
		isDomReady = 0,

		// a function to call to cause onLoad to be called when all requested modules have been loaded
		requestCompleteSignal,

		// The queue of functions waiting to execute as soon as dojo.ready conditions satisfied
		loadQ = [],

		// prevent recursion in onLoad
		onLoadRecursiveGuard = 0,

		handleDomReady = function(){
			isDomReady = 1;
			dojo._postLoad = dojo.config.afterOnLoad = true;
			if(loadQ.length){
				requestCompleteSignal(onLoad);
			}
		},

		// run the next function queued with dojo.ready
		onLoad = function(){
			if(isDomReady && !onLoadRecursiveGuard && loadQ.length){
				//guard against recursions into this function
				onLoadRecursiveGuard = 1;
				var f = loadQ.shift();
					try{
						f();
					}
						// FIXME: signal the error via require.on
					finally{
						onLoadRecursiveGuard = 0;
					}
				onLoadRecursiveGuard = 0;
				if(loadQ.length){
					requestCompleteSignal(onLoad);
				}
			}
		};

	// define requireCompleteSignal; impl depends on loader
	if(1){
		require.on("idle", onLoad);
		requestCompleteSignal = function(){
			if(require.idle()){
				onLoad();
			} // else do nothing, onLoad will be called with the next idle signal
		};
	}else{
		// RequireJS or similar
		requestCompleteSignal = function(){
			// the next function call will fail if you don't have a loader with require.ready
			// in that case, either fix your loader, use dojo's loader, or don't call dojo.ready;
			require.ready(onLoad);
		};
	}

	var ready = dojo.ready = dojo.addOnLoad = function(priority, context, callback){
		// summary: Add a function to execute on DOM content loaded and all requested modules have arrived and been evaluated.
		// priority: Integer?
		//		The order in which to exec this callback relative to other callbacks, defaults to 1000
		// context: Object?|Function
		//		The context in which to run execute callback, or a callback if not using context
		// callback: Function?
		//		The function to execute.
		//
		// example:
		//	Simple DOM and Modules ready syntax
		//	|	dojo.ready(function(){ alert("Dom ready!"); });
		//
		// example:
		//	Using a priority
		//	|	dojo.ready(2, function(){ alert("low priority ready!"); })
		//
		// example:
		//	Using context
		//	|	dojo.ready(foo, function(){
		//	|		// in here, this == foo
		//	|	})
		//
		// example:
		//	Using dojo.hitch style args:
		//	|	var foo = { dojoReady: function(){ console.warn(this, "dojo dom and modules ready."); } };
		//	|	dojo.ready(foo, "dojoReady");

		var hitchArgs = lang._toArray(arguments);
		if(typeof priority != "number"){
			callback = context;
			context = priority;
			priority = 1000;
		}else{
			hitchArgs.shift();
		}
		callback = callback ?
			lang.hitch.apply(dojo, hitchArgs) :
			function(){
				context();
			};
		callback.priority = priority;
		for(var i = 0; i < loadQ.length && priority >= loadQ[i].priority; i++){}
		loadQ.splice(i, 0, callback);
		requestCompleteSignal();
	};

	true || has.add("dojo-config-addOnLoad", 1);
	if(1){
		var dca = dojo.config.addOnLoad;
		if(dca){
			ready[(lang.isArray(dca) ? "apply" : "call")](dojo, dca);
		}
	}

	if(0 && dojo.config.parseOnLoad && !dojo.isAsync){
		ready(99, function(){
			if(!dojo.parser){
				dojo.deprecated("Add explicit require(['dojo/parser']);", "", "2.0");
				require(["dojo/parser"]);
			}
		});
	}

	if(1){
		domReady(handleDomReady);
	}else{
		handleDomReady();
	}

	return ready;
});

},
'dojox/charting/axis2d/common':function(){
define("dojox/charting/axis2d/common", ["dojo/_base/lang", "dojo/_base/html", "dojo/_base/window", "dojo/dom-geometry", "dojox/gfx"], 
	function(lang, html, win, domGeom, g){

	var common = lang.getObject("dojox.charting.axis2d.common", true);
	
	var clearNode = function(s){
		s.marginLeft   = "0px";
		s.marginTop    = "0px";
		s.marginRight  = "0px";
		s.marginBottom = "0px";
		s.paddingLeft   = "0px";
		s.paddingTop    = "0px";
		s.paddingRight  = "0px";
		s.paddingBottom = "0px";
		s.borderLeftWidth   = "0px";
		s.borderTopWidth    = "0px";
		s.borderRightWidth  = "0px";
		s.borderBottomWidth = "0px";
	};

	var getBoxWidth = function(n){
		// marginBox is incredibly slow, so avoid it if we can
		if(n["getBoundingClientRect"]){
			var bcr = n.getBoundingClientRect();
			return bcr.width || (bcr.right - bcr.left);
		}else{
			return domGeom.getMarginBox(n).w;
		}
	};

	return lang.mixin(common, {
		//	summary:
		//		Common methods to be used by any axis.  This is considered "static".
		createText: {
			gfx: function(chart, creator, x, y, align, text, font, fontColor){
				//	summary:
				//		Use dojox.gfx to create any text.
				//	chart: dojox.charting.Chart
				//		The chart to create the text into.
				//	creator: dojox.gfx.Surface
				//		The graphics surface to use for creating the text.
				//	x: Number
				//		Where to create the text along the x axis (CSS left).
				//	y: Number
				//		Where to create the text along the y axis (CSS top).
				//	align: String
				//		How to align the text.  Can be "left", "right", "center".
				//	text: String
				//		The text to render.
				//	font: String
				//		The font definition, a la CSS "font".
				//	fontColor: String|dojo.Color
				//		The color of the resultant text.
				//	returns: dojox.gfx.Text
				//		The resultant GFX object.
				return creator.createText({
					x: x, y: y, text: text, align: align
				}).setFont(font).setFill(fontColor);	//	dojox.gfx.Text
			},
			html: function(chart, creator, x, y, align, text, font, fontColor, labelWidth){
				//	summary:
				//		Use the HTML DOM to create any text.
				//	chart: dojox.charting.Chart
				//		The chart to create the text into.
				//	creator: dojox.gfx.Surface
				//		The graphics surface to use for creating the text.
				//	x: Number
				//		Where to create the text along the x axis (CSS left).
				//	y: Number
				//		Where to create the text along the y axis (CSS top).
				//	align: String
				//		How to align the text.  Can be "left", "right", "center".
				//	text: String
				//		The text to render.
				//	font: String
				//		The font definition, a la CSS "font".
				//	fontColor: String|dojo.Color
				//		The color of the resultant text.
				//	labelWidth: Number?
				//		The maximum width of the resultant DOM node.
				//	returns: DOMNode
				//		The resultant DOMNode (a "div" element).

				// setup the text node
				var p = win.doc.createElement("div"), s = p.style, boxWidth;
				// bidi support, if this function exists the module was loaded 
				if(chart.getTextDir){
					p.dir = chart.getTextDir(text);
				}
				clearNode(s);
				s.font = font;
				p.innerHTML = String(text).replace(/\s/g, "&nbsp;");
				s.color = fontColor;
				// measure the size
				s.position = "absolute";
				s.left = "-10000px";
				win.body().appendChild(p);
				var size = g.normalizedLength(g.splitFontString(font).size);

				// do we need to calculate the label width?
				if(!labelWidth){
					boxWidth = getBoxWidth(p);
				}
				// when the textDir is rtl, but the UI ltr needs
				// to recalculate the starting point
				if(p.dir == "rtl"){
					x += labelWidth ? labelWidth : boxWidth;
				}

				// new settings for the text node
				win.body().removeChild(p);

				s.position = "relative";
				if(labelWidth){
					s.width = labelWidth + "px";
					// s.border = "1px dotted grey";
					switch(align){
						case "middle":
							s.textAlign = "center";
							s.left = (x - labelWidth / 2) + "px";
							break;
						case "end":
							s.textAlign = "right";
							s.left = (x - labelWidth) + "px";
							break;
						default:
							s.left = x + "px";
							s.textAlign = "left";
							break;
					}
				}else{
					switch(align){
						case "middle":
							s.left = Math.floor(x - boxWidth / 2) + "px";
							// s.left = Math.floor(x - p.offsetWidth / 2) + "px";
							break;
						case "end":
							s.left = Math.floor(x - boxWidth) + "px";
							// s.left = Math.floor(x - p.offsetWidth) + "px";
							break;
						//case "start":
						default:
							s.left = Math.floor(x) + "px";
							break;
					}
				}
				s.top = Math.floor(y - size) + "px";
				s.whiteSpace = "nowrap";	// hack for WebKit
				// setup the wrapper node
				var wrap = win.doc.createElement("div"), w = wrap.style;
				clearNode(w);
				w.width = "0px";
				w.height = "0px";
				// insert nodes
				wrap.appendChild(p)
				chart.node.insertBefore(wrap, chart.node.firstChild);
				return wrap;	//	DOMNode
			}
		}
	});
});

},
'dojox/lang/functional/object':function(){
define("dojox/lang/functional/object", ["dojo/_base/kernel", "dojo/_base/lang", "dojo/_base/window", "./lambda"], function(dojo, lang, win, df){

// This module adds high-level functions and related constructs:
//	- object/dictionary helpers

// Defined methods:
//	- take any valid lambda argument as the functional argument
//	- skip all attributes that are present in the empty object
//		(IE and/or 3rd-party libraries).

	var empty = {};

/*=====
	var df = dojox.lang.functional;
 =====*/
	lang.mixin(df, {
		// object helpers
		keys: function(/*Object*/ obj){
			// summary: returns an array of all keys in the object
			var t = [];
			for(var i in obj){
				if(!(i in empty)){
					t.push(i);
				}
			}
			return	t; // Array
		},
		values: function(/*Object*/ obj){
			// summary: returns an array of all values in the object
			var t = [];
			for(var i in obj){
				if(!(i in empty)){
					t.push(obj[i]);
				}
			}
			return	t; // Array
		},
		filterIn: function(/*Object*/ obj, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates new object with all attributes that pass the test
			//	implemented by the provided function.
			o = o || win.global; f = df.lambda(f);
			var t = {}, v, i;
			for(i in obj){
				if(!(i in empty)){
					v = obj[i];
					if(f.call(o, v, i, obj)){ t[i] = v; }
				}
			}
			return t;	// Object
		},
		forIn: function(/*Object*/ obj, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: iterates over all object attributes.
			o = o || win.global; f = df.lambda(f);
			for(var i in obj){
				if(!(i in empty)){
					f.call(o, obj[i], i, obj);
				}
			}
			return o;	// Object
		},
		mapIn: function(/*Object*/ obj, /*Function|String|Array*/ f, /*Object?*/ o){
			// summary: creates new object with the results of calling
			//	a provided function on every attribute in this object.
			o = o || win.global; f = df.lambda(f);
			var t = {}, i;
			for(i in obj){
				if(!(i in empty)){
					t[i] = f.call(o, obj[i], i, obj);
				}
			}
			return t;	// Object
		}
	});
	
	return df;
});

},
'dojo/Evented':function(){
define(["./aspect", "./on"], function(aspect, on){
	// summary:
	//		The export of this module is a class that can be used as a mixin or base class, 
	// 		to add on() and emit() methods to a class
	// 		for listening for events and emiting events:
	// 		|define(["dojo/Evented"], function(Evented){
	// 		|	var EventedWidget = dojo.declare([Evented, dijit._Widget], {...});
	//		|	widget = new EventedWidget();
	//		|	widget.on("open", function(event){
	//		|	... do something with event
	//		|	 });
	//		|
	//		|	widget.emit("open", {name:"some event", ...});

 	"use strict";
 	var after = aspect.after;
	function Evented(){
	}
	Evented.prototype = {
		on: function(type, listener){
			return on.parse(this, type, listener, function(target, type){
				return after(target, 'on' + type, listener, true);
			});
		},
		emit: function(type, event){
			var args = [this];
			args.push.apply(args, arguments);
			return on.emit.apply(on, args);
		}
	};
	return Evented;
});

},
'dojo/_base/xhr':function(){
define([
	"./kernel", "./sniff", "require", "../io-query", "../dom", "../dom-form", "./Deferred", "./json", "./lang", "./array", "../on"
], function(dojo, has, require, ioq, dom, domForm, deferred, json, lang, array, on){
	//	module:
	//		dojo/_base.xhr
	// summary:
	//		This modules defines the dojo.xhr* API.

	has.add("native-xhr", function() {
		// if true, the environment has a native XHR implementation
		return typeof XMLHttpRequest !== 'undefined';
	});

	if(1 && require.getXhr){
		dojo._xhrObj = require.getXhr;
	}else if (has("native-xhr")){
		dojo._xhrObj = function(){
			// summary:
			//		does the work of portably generating a new XMLHTTPRequest object.
			try{
				return new XMLHttpRequest();
			}catch(e){
				throw new Error("XMLHTTP not available: "+e);
			}
		};
	}else{
		// PROGIDs are in order of decreasing likelihood; this will change in time.
		for(var XMLHTTP_PROGIDS = ['Msxml2.XMLHTTP', 'Microsoft.XMLHTTP', 'Msxml2.XMLHTTP.4.0'], progid, i = 0; i < 3;){
			try{
				progid = XMLHTTP_PROGIDS[i++];
				if (new ActiveXObject(progid)) {
					// this progid works; therefore, use it from now on
					break;
				}
			}catch(e){
				// squelch; we're just trying to find a good ActiveX PROGID
				// if they all fail, then progid ends up as the last attempt and that will signal the error
				// the first time the client actually tries to exec an xhr
			}
		}
		dojo._xhrObj= function() {
			return new ActiveXObject(progid);
		};
	}

	var cfg = dojo.config;

	// mix in io-query and dom-form
	dojo.objectToQuery = ioq.objectToQuery;
	dojo.queryToObject = ioq.queryToObject;
	dojo.fieldToObject = domForm.fieldToObject;
	dojo.formToObject = domForm.toObject;
	dojo.formToQuery = domForm.toQuery;
	dojo.formToJson = domForm.toJson;

	// need to block async callbacks from snatching this thread as the result
	// of an async callback might call another sync XHR, this hangs khtml forever
	// must checked by watchInFlight()

	dojo._blockAsync = false;

	// MOW: remove dojo._contentHandlers alias in 2.0
	var handlers = dojo._contentHandlers = dojo.contentHandlers = {
		// summary:
		//		A map of availble XHR transport handle types. Name matches the
		//		`handleAs` attribute passed to XHR calls.
		//
		// description:
		//		A map of availble XHR transport handle types. Name matches the
		//		`handleAs` attribute passed to XHR calls. Each contentHandler is
		//		called, passing the xhr object for manipulation. The return value
		//		from the contentHandler will be passed to the `load` or `handle`
		//		functions defined in the original xhr call.
		//
		// example:
		//		Creating a custom content-handler:
		//	|	dojo.contentHandlers.makeCaps = function(xhr){
		//	|		return xhr.responseText.toUpperCase();
		//	|	}
		//	|	// and later:
		//	|	dojo.xhrGet({
		//	|		url:"foo.txt",
		//	|		handleAs:"makeCaps",
		//	|		load: function(data){ /* data is a toUpper version of foo.txt */ }
		//	|	});

		"text": function(xhr){
			// summary: A contentHandler which simply returns the plaintext response data
			return xhr.responseText;
		},
		"json": function(xhr){
			// summary: A contentHandler which returns a JavaScript object created from the response data
			return json.fromJson(xhr.responseText || null);
		},
		"json-comment-filtered": function(xhr){
			// summary: A contentHandler which expects comment-filtered JSON.
			// description:
			//		A contentHandler which expects comment-filtered JSON.
			//		the json-comment-filtered option was implemented to prevent
			//		"JavaScript Hijacking", but it is less secure than standard JSON. Use
			//		standard JSON instead. JSON prefixing can be used to subvert hijacking.
			//
			//		Will throw a notice suggesting to use application/json mimetype, as
			//		json-commenting can introduce security issues. To decrease the chances of hijacking,
			//		use the standard `json` contentHandler, and prefix your "JSON" with: {}&&
			//
			//		use djConfig.useCommentedJson = true to turn off the notice
			if(!dojo.config.useCommentedJson){
				console.warn("Consider using the standard mimetype:application/json."
					+ " json-commenting can introduce security issues. To"
					+ " decrease the chances of hijacking, use the standard the 'json' handler and"
					+ " prefix your json with: {}&&\n"
					+ "Use djConfig.useCommentedJson=true to turn off this message.");
			}

			var value = xhr.responseText;
			var cStartIdx = value.indexOf("\/*");
			var cEndIdx = value.lastIndexOf("*\/");
			if(cStartIdx == -1 || cEndIdx == -1){
				throw new Error("JSON was not comment filtered");
			}
			return json.fromJson(value.substring(cStartIdx+2, cEndIdx));
		},
		"javascript": function(xhr){
			// summary: A contentHandler which evaluates the response data, expecting it to be valid JavaScript

			// FIXME: try Moz and IE specific eval variants?
			return dojo.eval(xhr.responseText);
		},
		"xml": function(xhr){
			// summary: A contentHandler returning an XML Document parsed from the response data
			var result = xhr.responseXML;

			if(has("ie")){
				if((!result || !result.documentElement)){
					//WARNING: this branch used by the xml handling in dojo.io.iframe,
					//so be sure to test dojo.io.iframe if making changes below.
					var ms = function(n){ return "MSXML" + n + ".DOMDocument"; };
					var dp = ["Microsoft.XMLDOM", ms(6), ms(4), ms(3), ms(2)];
					array.some(dp, function(p){
						try{
							var dom = new ActiveXObject(p);
							dom.async = false;
							dom.loadXML(xhr.responseText);
							result = dom;
						}catch(e){ return false; }
						return true;
					});
				}
		 }
			return result; // DOMDocument
		},
		"json-comment-optional": function(xhr){
			// summary: A contentHandler which checks the presence of comment-filtered JSON and
			//		alternates between the `json` and `json-comment-filtered` contentHandlers.
			if(xhr.responseText && /^[^{\[]*\/\*/.test(xhr.responseText)){
				return handlers["json-comment-filtered"](xhr);
			}else{
				return handlers["json"](xhr);
			}
		}
	};

	/*=====
	dojo.__IoArgs = function(){
		//	url: String
		//		URL to server endpoint.
		//	content: Object?
		//		Contains properties with string values. These
		//		properties will be serialized as name1=value2 and
		//		passed in the request.
		//	timeout: Integer?
		//		Milliseconds to wait for the response. If this time
		//		passes, the then error callbacks are called.
		//	form: DOMNode?
		//		DOM node for a form. Used to extract the form values
		//		and send to the server.
		//	preventCache: Boolean?
		//		Default is false. If true, then a
		//		"dojo.preventCache" parameter is sent in the request
		//		with a value that changes with each request
		//		(timestamp). Useful only with GET-type requests.
		//	handleAs: String?
		//		Acceptable values depend on the type of IO
		//		transport (see specific IO calls for more information).
		//	rawBody: String?
		//		Sets the raw body for an HTTP request. If this is used, then the content
		//		property is ignored. This is mostly useful for HTTP methods that have
		//		a body to their requests, like PUT or POST. This property can be used instead
		//		of postData and putData for dojo.rawXhrPost and dojo.rawXhrPut respectively.
		//	ioPublish: Boolean?
		//		Set this explicitly to false to prevent publishing of topics related to
		//		IO operations. Otherwise, if djConfig.ioPublish is set to true, topics
		//		will be published via dojo.publish for different phases of an IO operation.
		//		See dojo.__IoPublish for a list of topics that are published.
		//	load: Function?
		//		This function will be
		//		called on a successful HTTP response code.
		//	error: Function?
		//		This function will
		//		be called when the request fails due to a network or server error, the url
		//		is invalid, etc. It will also be called if the load or handle callback throws an
		//		exception, unless djConfig.debugAtAllCosts is true.	 This allows deployed applications
		//		to continue to run even when a logic error happens in the callback, while making
		//		it easier to troubleshoot while in debug mode.
		//	handle: Function?
		//		This function will
		//		be called at the end of every request, whether or not an error occurs.
		this.url = url;
		this.content = content;
		this.timeout = timeout;
		this.form = form;
		this.preventCache = preventCache;
		this.handleAs = handleAs;
		this.ioPublish = ioPublish;
		this.load = function(response, ioArgs){
			// ioArgs: dojo.__IoCallbackArgs
			//		Provides additional information about the request.
			// response: Object
			//		The response in the format as defined with handleAs.
		}
		this.error = function(response, ioArgs){
			// ioArgs: dojo.__IoCallbackArgs
			//		Provides additional information about the request.
			// response: Object
			//		The response in the format as defined with handleAs.
		}
		this.handle = function(loadOrError, response, ioArgs){
			// loadOrError: String
			//		Provides a string that tells you whether this function
			//		was called because of success (load) or failure (error).
			// response: Object
			//		The response in the format as defined with handleAs.
			// ioArgs: dojo.__IoCallbackArgs
			//		Provides additional information about the request.
		}
	}
	=====*/

	/*=====
	dojo.__IoCallbackArgs = function(args, xhr, url, query, handleAs, id, canDelete, json){
		//	args: Object
		//		the original object argument to the IO call.
		//	xhr: XMLHttpRequest
		//		For XMLHttpRequest calls only, the
		//		XMLHttpRequest object that was used for the
		//		request.
		//	url: String
		//		The final URL used for the call. Many times it
		//		will be different than the original args.url
		//		value.
		//	query: String
		//		For non-GET requests, the
		//		name1=value1&name2=value2 parameters sent up in
		//		the request.
		//	handleAs: String
		//		The final indicator on how the response will be
		//		handled.
		//	id: String
		//		For dojo.io.script calls only, the internal
		//		script ID used for the request.
		//	canDelete: Boolean
		//		For dojo.io.script calls only, indicates
		//		whether the script tag that represents the
		//		request can be deleted after callbacks have
		//		been called. Used internally to know when
		//		cleanup can happen on JSONP-type requests.
		//	json: Object
		//		For dojo.io.script calls only: holds the JSON
		//		response for JSONP-type requests. Used
		//		internally to hold on to the JSON responses.
		//		You should not need to access it directly --
		//		the same object should be passed to the success
		//		callbacks directly.
		this.args = args;
		this.xhr = xhr;
		this.url = url;
		this.query = query;
		this.handleAs = handleAs;
		this.id = id;
		this.canDelete = canDelete;
		this.json = json;
	}
	=====*/


	/*=====
	dojo.__IoPublish = function(){
		//	summary:
		//		This is a list of IO topics that can be published
		//		if djConfig.ioPublish is set to true. IO topics can be
		//		published for any Input/Output, network operation. So,
		//		dojo.xhr, dojo.io.script and dojo.io.iframe can all
		//		trigger these topics to be published.
		//	start: String
		//		"/dojo/io/start" is sent when there are no outstanding IO
		//		requests, and a new IO request is started. No arguments
		//		are passed with this topic.
		//	send: String
		//		"/dojo/io/send" is sent whenever a new IO request is started.
		//		It passes the dojo.Deferred for the request with the topic.
		//	load: String
		//		"/dojo/io/load" is sent whenever an IO request has loaded
		//		successfully. It passes the response and the dojo.Deferred
		//		for the request with the topic.
		//	error: String
		//		"/dojo/io/error" is sent whenever an IO request has errored.
		//		It passes the error and the dojo.Deferred
		//		for the request with the topic.
		//	done: String
		//		"/dojo/io/done" is sent whenever an IO request has completed,
		//		either by loading or by erroring. It passes the error and
		//		the dojo.Deferred for the request with the topic.
		//	stop: String
		//		"/dojo/io/stop" is sent when all outstanding IO requests have
		//		finished. No arguments are passed with this topic.
		this.start = "/dojo/io/start";
		this.send = "/dojo/io/send";
		this.load = "/dojo/io/load";
		this.error = "/dojo/io/error";
		this.done = "/dojo/io/done";
		this.stop = "/dojo/io/stop";
	}
	=====*/


	dojo._ioSetArgs = function(/*dojo.__IoArgs*/args,
			/*Function*/canceller,
			/*Function*/okHandler,
			/*Function*/errHandler){
		//	summary:
		//		sets up the Deferred and ioArgs property on the Deferred so it
		//		can be used in an io call.
		//	args:
		//		The args object passed into the public io call. Recognized properties on
		//		the args object are:
		//	canceller:
		//		The canceller function used for the Deferred object. The function
		//		will receive one argument, the Deferred object that is related to the
		//		canceller.
		//	okHandler:
		//		The first OK callback to be registered with Deferred. It has the opportunity
		//		to transform the OK response. It will receive one argument -- the Deferred
		//		object returned from this function.
		//	errHandler:
		//		The first error callback to be registered with Deferred. It has the opportunity
		//		to do cleanup on an error. It will receive two arguments: error (the
		//		Error object) and dfd, the Deferred object returned from this function.

		var ioArgs = {args: args, url: args.url};

		//Get values from form if requestd.
		var formObject = null;
		if(args.form){
			var form = dom.byId(args.form);
			//IE requires going through getAttributeNode instead of just getAttribute in some form cases,
			//so use it for all. See #2844
			var actnNode = form.getAttributeNode("action");
			ioArgs.url = ioArgs.url || (actnNode ? actnNode.value : null);
			formObject = domForm.toObject(form);
		}

		// set up the query params
		var miArgs = [{}];

		if(formObject){
			// potentially over-ride url-provided params w/ form values
			miArgs.push(formObject);
		}
		if(args.content){
			// stuff in content over-rides what's set by form
			miArgs.push(args.content);
		}
		if(args.preventCache){
			miArgs.push({"dojo.preventCache": new Date().valueOf()});
		}
		ioArgs.query = ioq.objectToQuery(lang.mixin.apply(null, miArgs));

		// .. and the real work of getting the deferred in order, etc.
		ioArgs.handleAs = args.handleAs || "text";
		var d = new deferred(canceller);
		d.addCallbacks(okHandler, function(error){
			return errHandler(error, d);
		});

		//Support specifying load, error and handle callback functions from the args.
		//For those callbacks, the "this" object will be the args object.
		//The callbacks will get the deferred result value as the
		//first argument and the ioArgs object as the second argument.
		var ld = args.load;
		if(ld && lang.isFunction(ld)){
			d.addCallback(function(value){
				return ld.call(args, value, ioArgs);
			});
		}
		var err = args.error;
		if(err && lang.isFunction(err)){
			d.addErrback(function(value){
				return err.call(args, value, ioArgs);
			});
		}
		var handle = args.handle;
		if(handle && lang.isFunction(handle)){
			d.addBoth(function(value){
				return handle.call(args, value, ioArgs);
			});
		}

		//Plug in topic publishing, if dojo.publish is loaded.
		if(cfg.ioPublish && dojo.publish && ioArgs.args.ioPublish !== false){
			d.addCallbacks(
				function(res){
					dojo.publish("/dojo/io/load", [d, res]);
					return res;
				},
				function(res){
					dojo.publish("/dojo/io/error", [d, res]);
					return res;
				}
			);
			d.addBoth(function(res){
				dojo.publish("/dojo/io/done", [d, res]);
				return res;
			});
		}

		d.ioArgs = ioArgs;

		// FIXME: need to wire up the xhr object's abort method to something
		// analagous in the Deferred
		return d;
	};

	var _deferredCancel = function(/*Deferred*/dfd){
		// summary: canceller function for dojo._ioSetArgs call.

		dfd.canceled = true;
		var xhr = dfd.ioArgs.xhr;
		var _at = typeof xhr.abort;
		if(_at == "function" || _at == "object" || _at == "unknown"){
			xhr.abort();
		}
		var err = dfd.ioArgs.error;
		if(!err){
			err = new Error("xhr cancelled");
			err.dojoType="cancel";
		}
		return err;
	};
	var _deferredOk = function(/*Deferred*/dfd){
		// summary: okHandler function for dojo._ioSetArgs call.

		var ret = handlers[dfd.ioArgs.handleAs](dfd.ioArgs.xhr);
		return ret === undefined ? null : ret;
	};
	var _deferError = function(/*Error*/error, /*Deferred*/dfd){
		// summary: errHandler function for dojo._ioSetArgs call.

		if(!dfd.ioArgs.args.failOk){
			console.error(error);
		}
		return error;
	};

	// avoid setting a timer per request. It degrades performance on IE
	// something fierece if we don't use unified loops.
	var _inFlightIntvl = null;
	var _inFlight = [];


	//Use a separate count for knowing if we are starting/stopping io calls.
	//Cannot use _inFlight.length since it can change at a different time than
	//when we want to do this kind of test. We only want to decrement the count
	//after a callback/errback has finished, since the callback/errback should be
	//considered as part of finishing a request.
	var _pubCount = 0;
	var _checkPubCount = function(dfd){
		if(_pubCount <= 0){
			_pubCount = 0;
			if(cfg.ioPublish && dojo.publish && (!dfd || dfd && dfd.ioArgs.args.ioPublish !== false)){
				dojo.publish("/dojo/io/stop");
			}
		}
	};

	var _watchInFlight = function(){
		//summary:
		//		internal method that checks each inflight XMLHttpRequest to see
		//		if it has completed or if the timeout situation applies.

		var now = (new Date()).getTime();
		// make sure sync calls stay thread safe, if this callback is called
		// during a sync call and this results in another sync call before the
		// first sync call ends the browser hangs
		if(!dojo._blockAsync){
			// we need manual loop because we often modify _inFlight (and therefore 'i') while iterating
			// note: the second clause is an assigment on purpose, lint may complain
			for(var i = 0, tif; i < _inFlight.length && (tif = _inFlight[i]); i++){
				var dfd = tif.dfd;
				var func = function(){
					if(!dfd || dfd.canceled || !tif.validCheck(dfd)){
						_inFlight.splice(i--, 1);
						_pubCount -= 1;
					}else if(tif.ioCheck(dfd)){
						_inFlight.splice(i--, 1);
						tif.resHandle(dfd);
						_pubCount -= 1;
					}else if(dfd.startTime){
						//did we timeout?
						if(dfd.startTime + (dfd.ioArgs.args.timeout || 0) < now){
							_inFlight.splice(i--, 1);
							var err = new Error("timeout exceeded");
							err.dojoType = "timeout";
							dfd.errback(err);
							//Cancel the request so the io module can do appropriate cleanup.
							dfd.cancel();
							_pubCount -= 1;
						}
					}
				};
				if(dojo.config.debugAtAllCosts){
					func.call(this);
				}else{
					try{
						func.call(this);
					}catch(e){
						dfd.errback(e);
					}
				}
			}
		}

		_checkPubCount(dfd);

		if(!_inFlight.length){
			clearInterval(_inFlightIntvl);
			_inFlightIntvl = null;
		}
	};

	dojo._ioCancelAll = function(){
		//summary: Cancels all pending IO requests, regardless of IO type
		//(xhr, script, iframe).
		try{
			array.forEach(_inFlight, function(i){
				try{
					i.dfd.cancel();
				}catch(e){/*squelch*/}
			});
		}catch(e){/*squelch*/}
	};

	//Automatically call cancel all io calls on unload
	//in IE for trac issue #2357.
	if(has("ie")){
		on(window, "unload", dojo._ioCancelAll);
	}

	dojo._ioNotifyStart = function(/*Deferred*/dfd){
		// summary:
		//		If dojo.publish is available, publish topics
		//		about the start of a request queue and/or the
		//		the beginning of request.
		// description:
		//		Used by IO transports. An IO transport should
		//		call this method before making the network connection.
		if(cfg.ioPublish && dojo.publish && dfd.ioArgs.args.ioPublish !== false){
			if(!_pubCount){
				dojo.publish("/dojo/io/start");
			}
			_pubCount += 1;
			dojo.publish("/dojo/io/send", [dfd]);
		}
	};

	dojo._ioWatch = function(dfd, validCheck, ioCheck, resHandle){
		// summary:
		//		Watches the io request represented by dfd to see if it completes.
		// dfd: Deferred
		//		The Deferred object to watch.
		// validCheck: Function
		//		Function used to check if the IO request is still valid. Gets the dfd
		//		object as its only argument.
		// ioCheck: Function
		//		Function used to check if basic IO call worked. Gets the dfd
		//		object as its only argument.
		// resHandle: Function
		//		Function used to process response. Gets the dfd
		//		object as its only argument.
		var args = dfd.ioArgs.args;
		if(args.timeout){
			dfd.startTime = (new Date()).getTime();
		}

		_inFlight.push({dfd: dfd, validCheck: validCheck, ioCheck: ioCheck, resHandle: resHandle});
		if(!_inFlightIntvl){
			_inFlightIntvl = setInterval(_watchInFlight, 50);
		}
		// handle sync requests
		//A weakness: async calls in flight
		//could have their handlers called as part of the
		//_watchInFlight call, before the sync's callbacks
		// are called.
		if(args.sync){
			_watchInFlight();
		}
	};

	var _defaultContentType = "application/x-www-form-urlencoded";

	var _validCheck = function(/*Deferred*/dfd){
		return dfd.ioArgs.xhr.readyState; //boolean
	};
	var _ioCheck = function(/*Deferred*/dfd){
		return 4 == dfd.ioArgs.xhr.readyState; //boolean
	};
	var _resHandle = function(/*Deferred*/dfd){
		var xhr = dfd.ioArgs.xhr;
		if(dojo._isDocumentOk(xhr)){
			dfd.callback(dfd);
		}else{
			var err = new Error("Unable to load " + dfd.ioArgs.url + " status:" + xhr.status);
			err.status = xhr.status;
			err.responseText = xhr.responseText;
			err.xhr = xhr;
			dfd.errback(err);
		}
	};

	dojo._ioAddQueryToUrl = function(/*dojo.__IoCallbackArgs*/ioArgs){
		//summary: Adds query params discovered by the io deferred construction to the URL.
		//Only use this for operations which are fundamentally GET-type operations.
		if(ioArgs.query.length){
			ioArgs.url += (ioArgs.url.indexOf("?") == -1 ? "?" : "&") + ioArgs.query;
			ioArgs.query = null;
		}
	};

	/*=====
	dojo.declare("dojo.__XhrArgs", dojo.__IoArgs, {
		constructor: function(){
			//	summary:
			//		In addition to the properties listed for the dojo._IoArgs type,
			//		the following properties are allowed for dojo.xhr* methods.
			//	handleAs: String?
			//		Acceptable values are: text (default), json, json-comment-optional,
			//		json-comment-filtered, javascript, xml. See `dojo.contentHandlers`
			//	sync: Boolean?
			//		false is default. Indicates whether the request should
			//		be a synchronous (blocking) request.
			//	headers: Object?
			//		Additional HTTP headers to send in the request.
			//	failOk: Boolean?
			//		false is default. Indicates whether a request should be
			//		allowed to fail (and therefore no console error message in
			//		the event of a failure)
			//	contentType: String|Boolean
			//		"application/x-www-form-urlencoded" is default. Set to false to
			//		prevent a Content-Type header from being sent, or to a string
			//		to send a different Content-Type.
			this.handleAs = handleAs;
			this.sync = sync;
			this.headers = headers;
			this.failOk = failOk;
		}
	});
	=====*/

	dojo.xhr = function(/*String*/ method, /*dojo.__XhrArgs*/ args, /*Boolean?*/ hasBody){
		//	summary:
		//		Sends an HTTP request with the given method.
		//	description:
		//		Sends an HTTP request with the given method.
		//		See also dojo.xhrGet(), xhrPost(), xhrPut() and dojo.xhrDelete() for shortcuts
		//		for those HTTP methods. There are also methods for "raw" PUT and POST methods
		//		via dojo.rawXhrPut() and dojo.rawXhrPost() respectively.
		//	method:
		//		HTTP method to be used, such as GET, POST, PUT, DELETE. Should be uppercase.
		//	hasBody:
		//		If the request has an HTTP body, then pass true for hasBody.

		//Make the Deferred object for this xhr request.
		var dfd = dojo._ioSetArgs(args, _deferredCancel, _deferredOk, _deferError);
		var ioArgs = dfd.ioArgs;

		//Pass the args to _xhrObj, to allow alternate XHR calls based specific calls, like
		//the one used for iframe proxies.
		var xhr = ioArgs.xhr = dojo._xhrObj(ioArgs.args);
		//If XHR factory fails, cancel the deferred.
		if(!xhr){
			dfd.cancel();
			return dfd;
		}

		//Allow for specifying the HTTP body completely.
		if("postData" in args){
			ioArgs.query = args.postData;
		}else if("putData" in args){
			ioArgs.query = args.putData;
		}else if("rawBody" in args){
			ioArgs.query = args.rawBody;
		}else if((arguments.length > 2 && !hasBody) || "POST|PUT".indexOf(method.toUpperCase()) == -1){
			//Check for hasBody being passed. If no hasBody,
			//then only append query string if not a POST or PUT request.
			dojo._ioAddQueryToUrl(ioArgs);
		}

		// IE 6 is a steaming pile. It won't let you call apply() on the native function (xhr.open).
		// workaround for IE6's apply() "issues"
		xhr.open(method, ioArgs.url, args.sync !== true, args.user || undefined, args.password || undefined);
		if(args.headers){
			for(var hdr in args.headers){
				if(hdr.toLowerCase() === "content-type" && !args.contentType){
					args.contentType = args.headers[hdr];
				}else if(args.headers[hdr]){
					//Only add header if it has a value. This allows for instnace, skipping
					//insertion of X-Requested-With by specifying empty value.
					xhr.setRequestHeader(hdr, args.headers[hdr]);
				}
			}
		}
		// FIXME: is this appropriate for all content types?
		if(args.contentType !== false){
			xhr.setRequestHeader("Content-Type", args.contentType || _defaultContentType);
		}
		if(!args.headers || !("X-Requested-With" in args.headers)){
			xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
		}
		// FIXME: set other headers here!
		dojo._ioNotifyStart(dfd);
		if(dojo.config.debugAtAllCosts){
			xhr.send(ioArgs.query);
		}else{
			try{
				xhr.send(ioArgs.query);
			}catch(e){
				ioArgs.error = e;
				dfd.cancel();
			}
		}
		dojo._ioWatch(dfd, _validCheck, _ioCheck, _resHandle);
		xhr = null;
		return dfd; // dojo.Deferred
	};

	dojo.xhrGet = function(/*dojo.__XhrArgs*/ args){
		//	summary:
		//		Sends an HTTP GET request to the server.
		return dojo.xhr("GET", args); // dojo.Deferred
	};

	dojo.rawXhrPost = dojo.xhrPost = function(/*dojo.__XhrArgs*/ args){
		//	summary:
		//		Sends an HTTP POST request to the server. In addtion to the properties
		//		listed for the dojo.__XhrArgs type, the following property is allowed:
		//	postData:
		//		String. Send raw data in the body of the POST request.
		return dojo.xhr("POST", args, true); // dojo.Deferred
	};

	dojo.rawXhrPut = dojo.xhrPut = function(/*dojo.__XhrArgs*/ args){
		//	summary:
		//		Sends an HTTP PUT request to the server. In addtion to the properties
		//		listed for the dojo.__XhrArgs type, the following property is allowed:
		//	putData:
		//		String. Send raw data in the body of the PUT request.
		return dojo.xhr("PUT", args, true); // dojo.Deferred
	};

	dojo.xhrDelete = function(/*dojo.__XhrArgs*/ args){
		//	summary:
		//		Sends an HTTP DELETE request to the server.
		return dojo.xhr("DELETE", args); //dojo.Deferred
	};

	/*
	dojo.wrapForm = function(formNode){
		//summary:
		//		A replacement for FormBind, but not implemented yet.

		// FIXME: need to think harder about what extensions to this we might
		// want. What should we allow folks to do w/ this? What events to
		// set/send?
		throw new Error("dojo.wrapForm not yet implemented");
	}
	*/

	dojo._isDocumentOk = function(http){
		var stat = http.status || 0;
		stat =
			(stat >= 200 && stat < 300) || // allow any 2XX response code
			stat == 304 ||                 // or, get it out of the cache
			stat == 1223 ||                // or, Internet Explorer mangled the status code
			!stat;                         // or, we're Titanium/browser chrome/chrome extension requesting a local file
		return stat; // Boolean
	};

	dojo._getText = function(url){
		var result;
		dojo.xhrGet({url:url, sync:true, load:function(text){
			result = text;
		}});
		return result;
	};

	// Add aliases for static functions to dojo.xhr since dojo.xhr is what's returned from this module
	lang.mixin(dojo.xhr, {
		_xhrObj: dojo._xhrObj,
		fieldToObject: domForm.fieldToObject,
		formToObject: domForm.toObject,
		objectToQuery: ioq.objectToQuery,
		formToQuery: domForm.toQuery,
		formToJson: domForm.toJson,
		queryToObject: ioq.queryToObject,
		contentHandlers: handlers,
		_ioSetArgs: dojo._ioSetArgs,
		_ioCancelAll: dojo._ioCancelAll,
		_ioNotifyStart: dojo._ioNotifyStart,
		_ioWatch: dojo._ioWatch,
		_ioAddQueryToUrl: dojo._ioAddQueryToUrl,
		_isDocumentOk: dojo._isDocumentOk,
		_getText: dojo._getText,
		get: dojo.xhrGet,
		post: dojo.xhrPost,
		put: dojo.xhrPut,
		del: dojo.xhrDelete	// because "delete" is a reserved word
	});

	return dojo.xhr;
});

},
'dojox/charting/axis2d/Default':function(){
define("dojox/charting/axis2d/Default", ["dojo/_base/lang", "dojo/_base/array","dojo/_base/sniff", "dojo/_base/declare", 
	"dojo/_base/connect", "dojo/_base/html", "dojo/dom-geometry", "./Invisible", 
	"../scaler/common", "../scaler/linear", "./common", "dojox/gfx", "dojox/lang/utils"], 
	function(lang, arr, has, declare, connect, html, domGeom, Invisible, scommon, 
			lin, acommon, g, du){

	/*=====
		dojox.charting.axis2d.__AxisCtorArgs = function(
			vertical, fixUpper, fixLower, natural, leftBottom,
			includeZero, fixed, majorLabels, minorTicks, minorLabels, microTicks, htmlLabels,
			min, max, from, to, majorTickStep, minorTickStep, microTickStep,
			labels, labelFunc, maxLabelSize,
			stroke, majorTick, minorTick, microTick, tick,
			font, fontColor
		){
		//	summary:
		//		Optional arguments used in the definition of an axis.
		//
		//	vertical: Boolean?
		//		A flag that says whether an axis is vertical (i.e. y axis) or horizontal. Default is false (horizontal).
		//	fixUpper: String?
		//		Align the greatest value on the axis with the specified tick level. Options are "major", "minor", "micro", or "none".  Defaults to "none".
		//	fixLower: String?
		//		Align the smallest value on the axis with the specified tick level. Options are "major", "minor", "micro", or "none".  Defaults to "none".
		//	natural: Boolean?
		//		Ensure tick marks are made on "natural" numbers. Defaults to false.
		//	leftBottom: Boolean?
		//		The position of a vertical axis; if true, will be placed against the left-bottom corner of the chart.  Defaults to true.
		//	includeZero: Boolean?
		//		Include 0 on the axis rendering.  Default is false.
		//	fixed: Boolean?
		//		Force all axis labels to be fixed numbers.  Default is true.
		//	majorLabels: Boolean?
		//		Flag to draw all labels at major ticks. Default is true.
		//	minorTicks: Boolean?
		//		Flag to draw minor ticks on an axis.  Default is true.
		//	minorLabels: Boolean?
		//		Flag to draw labels on minor ticks. Default is true.
		//	microTicks: Boolean?
		//		Flag to draw micro ticks on an axis. Default is false.
		//	htmlLabels: Boolean?
		//		Flag to use HTML (as opposed to the native vector graphics engine) to draw labels. Default is true.
		//	min: Number?
		//		The smallest value on an axis. Default is 0.
		//	max: Number?
		//		The largest value on an axis. Default is 1.
		//	from: Number?
		//		Force the chart to render data visible from this value. Default is 0.
		//	to: Number?
		//		Force the chart to render data visible to this value. Default is 1.
		//	majorTickStep: Number?
		//		The amount to skip before a major tick is drawn.  Default is 4.
		//	minorTickStep: Number?
		//		The amount to skip before a minor tick is drawn. Default is 2.
		//	microTickStep: Number?
		//		The amount to skip before a micro tick is drawn. Default is 1.
		//	labels: Object[]?
		//		An array of labels for major ticks, with corresponding numeric values, ordered by value.
		//	labelFunc: Function?
		//		An optional function used to compute label values.
		//	maxLabelSize: Number?
		//		The maximum size, in pixels, for a label.  To be used with the optional label function.
		//	stroke: dojox.gfx.Stroke?
		//		An optional stroke to be used for drawing an axis.
		//	majorTick: Object?
		//		An object containing a dojox.gfx.Stroke, and a length (number) for a major tick.
		//	minorTick: Object?
		//		An object containing a dojox.gfx.Stroke, and a length (number) for a minor tick.
		//	microTick: Object?
		//		An object containing a dojox.gfx.Stroke, and a length (number) for a micro tick.
		//	tick: Object?
		//		An object containing a dojox.gfx.Stroke, and a length (number) for a tick.
		//	font: String?
		//		An optional font definition (as used in the CSS font property) for labels.
		//	fontColor: String|dojo.Color?
		//		An optional color to be used in drawing labels.
		//	enableCache: Boolean?
		//		Whether the ticks and labels are cached from one rendering to another. This improves the rendering performance of
		//		successive rendering but penalize the first rendering. For labels it is only working with gfx labels
		//		not html ones.  Default false.
	
		this.vertical = vertical;
		this.fixUpper = fixUpper;
		this.fixLower = fixLower;
		this.natural = natural;
		this.leftBottom = leftBottom;
		this.includeZero = includeZero;
		this.fixed = fixed;
		this.majorLabels = majorLabels;
		this.minorTicks = minorTicks;
		this.minorLabels = minorLabels;
		this.microTicks = microTicks;
		this.htmlLabels = htmlLabels;
		this.min = min;
		this.max = max;
		this.from = from;
		this.to = to;
		this.majorTickStep = majorTickStep;
		this.minorTickStep = minorTickStep;
		this.microTickStep = microTickStep;
		this.labels = labels;
		this.labelFunc = labelFunc;
		this.maxLabelSize = maxLabelSize;
		this.stroke = stroke;
		this.majorTick = majorTick;
		this.minorTick = minorTick;
		this.microTick = microTick;
		this.tick = tick;
		this.font = font;
		this.fontColor = fontColor;
		this.enableCache = enableCache;
	}
	var Invisible = dojox.charting.axis2d.Invisible
	=====*/

	var labelGap = 4,			// in pixels
		centerAnchorLimit = 45;	// in degrees

	return declare("dojox.charting.axis2d.Default", Invisible, {
		//	summary:
		//		The default axis object used in dojox.charting.  See dojox.charting.Chart.addAxis for details.
		//
		//	defaultParams: Object
		//		The default parameters used to define any axis.
		//	optionalParams: Object
		//		Any optional parameters needed to define an axis.

		/*
		//	TODO: the documentation tools need these to be pre-defined in order to pick them up
		//	correctly, but the code here is partially predicated on whether or not the properties
		//	actually exist.  For now, we will leave these undocumented but in the code for later. -- TRT

		//	opt: Object
		//		The actual options used to define this axis, created at initialization.
		//	scalar: Object
		//		The calculated helper object to tell charts how to draw an axis and any data.
		//	ticks: Object
		//		The calculated tick object that helps a chart draw the scaling on an axis.
		//	dirty: Boolean
		//		The state of the axis (whether it needs to be redrawn or not)
		//	scale: Number
		//		The current scale of the axis.
		//	offset: Number
		//		The current offset of the axis.

		opt: null,
		scalar: null,
		ticks: null,
		dirty: true,
		scale: 1,
		offset: 0,
		*/
		defaultParams: {
			vertical:    false,		// true for vertical axis
			fixUpper:    "none",	// align the upper on ticks: "major", "minor", "micro", "none"
			fixLower:    "none",	// align the lower on ticks: "major", "minor", "micro", "none"
			natural:     false,		// all tick marks should be made on natural numbers
			leftBottom:  true,		// position of the axis, used with "vertical"
			includeZero: false,		// 0 should be included
			fixed:       true,		// all labels are fixed numbers
			majorLabels: true,		// draw major labels
			minorTicks:  true,		// draw minor ticks
			minorLabels: true,		// draw minor labels
			microTicks:  false,		// draw micro ticks
			rotation:    0,			// label rotation angle in degrees
			htmlLabels:  true,		// use HTML to draw labels
			enableCache: false		// whether we cache or not
		},
		optionalParams: {
			min:			0,	// minimal value on this axis
			max:			1,	// maximal value on this axis
			from:			0,	// visible from this value
			to:				1,	// visible to this value
			majorTickStep:	4,	// major tick step
			minorTickStep:	2,	// minor tick step
			microTickStep:	1,	// micro tick step
			labels:			[],	// array of labels for major ticks
								// with corresponding numeric values
								// ordered by values
			labelFunc:		null, // function to compute label values
			maxLabelSize:	0,	// size in px. For use with labelFunc
			maxLabelCharCount:	0,	// size in word count.
			trailingSymbol:	null,

			// TODO: add support for minRange!
			// minRange:		1,	// smallest distance from min allowed on the axis

			// theme components
			stroke:			{},	// stroke for an axis
			majorTick:		{},	// stroke + length for a tick
			minorTick:		{},	// stroke + length for a tick
			microTick:		{},	// stroke + length for a tick
			tick:           {},	// stroke + length for a tick
			font:			"",	// font for labels
			fontColor:		"",	// color for labels as a string
			title:		 		"",	// axis title
			titleGap:	 		0,		// gap between axis title and axis label
			titleFont:	 		"",		// axis title font
			titleFontColor:	 	"",		// axis title font color
			titleOrientation: 	""		// "axis" means the title facing the axis, "away" means facing away
		},

		constructor: function(chart, kwArgs){
			//	summary:
			//		The constructor for an axis.
			//	chart: dojox.charting.Chart
			//		The chart the axis belongs to.
			//	kwArgs: dojox.charting.axis2d.__AxisCtorArgs?
			//		Any optional keyword arguments to be used to define this axis.
			this.opt = lang.clone(this.defaultParams);
            du.updateWithObject(this.opt, kwArgs);
			du.updateWithPattern(this.opt, kwArgs, this.optionalParams);
			if(this.opt.enableCache){
				this._textFreePool = [];
				this._lineFreePool = [];
				this._textUsePool = [];
				this._lineUsePool = [];
			}
		},
		getOffsets: function(){
			//	summary:
			//		Get the physical offset values for this axis (used in drawing data series).
			//	returns: Object
			//		The calculated offsets in the form of { l, r, t, b } (left, right, top, bottom).
			var s = this.scaler, offsets = { l: 0, r: 0, t: 0, b: 0 };
			if(!s){
				return offsets;
			}
			var o = this.opt, labelWidth = 0, a, b, c, d,
				gl = scommon.getNumericLabel,
				offset = 0, ma = s.major, mi = s.minor,
				ta = this.chart.theme.axis,
				// TODO: we use one font --- of major tick, we need to use major and minor fonts
				taFont = o.font || (ta.majorTick && ta.majorTick.font) || (ta.tick && ta.tick.font),
				taTitleFont = o.titleFont || (ta.tick && ta.tick.titleFont),
				taTitleGap = (o.titleGap==0) ? 0 : o.titleGap || (ta.tick && ta.tick.titleGap) || 15,
				taMajorTick = this.chart.theme.getTick("major", o),
				taMinorTick = this.chart.theme.getTick("minor", o),
				size = taFont ? g.normalizedLength(g.splitFontString(taFont).size) : 0,
				tsize = taTitleFont ? g.normalizedLength(g.splitFontString(taTitleFont).size) : 0,
				rotation = o.rotation % 360, leftBottom = o.leftBottom,
				cosr = Math.abs(Math.cos(rotation * Math.PI / 180)),
				sinr = Math.abs(Math.sin(rotation * Math.PI / 180));
			this.trailingSymbol = (o.trailingSymbol === undefined || o.trailingSymbol === null) ? this.trailingSymbol : o.trailingSymbol;
			if(rotation < 0){
				rotation += 360;
			}

			if(size){
				// we need width of all labels
				if(this.labels){
					labelWidth = this._groupLabelWidth(this.labels, taFont, o.maxLabelCharCount);
				}else{
					labelWidth = this._groupLabelWidth([
						gl(ma.start, ma.prec, o),
						gl(ma.start + ma.count * ma.tick, ma.prec, o),
						gl(mi.start, mi.prec, o),
						gl(mi.start + mi.count * mi.tick, mi.prec, o)
					], taFont, o.maxLabelCharCount);
				}
				labelWidth = o.maxLabelSize ? Math.min(o.maxLabelSize, labelWidth) : labelWidth;
				if(this.vertical){
					var side = leftBottom ? "l" : "r";
					switch(rotation){
						case 0:
						case 180:
							offsets[side] = labelWidth;
							offsets.t = offsets.b = size / 2;
							break;
						case 90:
						case 270:
							offsets[side] = size;
							offsets.t = offsets.b = labelWidth / 2;
							break;
						default:
							if(rotation <= centerAnchorLimit || (180 < rotation && rotation <= (180 + centerAnchorLimit))){
								offsets[side] = size * sinr / 2 + labelWidth * cosr;
								offsets[leftBottom ? "t" : "b"] = size * cosr / 2 + labelWidth * sinr;
								offsets[leftBottom ? "b" : "t"] = size * cosr / 2;
							}else if(rotation > (360 - centerAnchorLimit) || (180 > rotation && rotation > (180 - centerAnchorLimit))){
								offsets[side] = size * sinr / 2 + labelWidth * cosr;
								offsets[leftBottom ? "b" : "t"] = size * cosr / 2 + labelWidth * sinr;
								offsets[leftBottom ? "t" : "b"] = size * cosr / 2;
							}else if(rotation < 90 || (180 < rotation && rotation < 270)){
								offsets[side] = size * sinr + labelWidth * cosr;
								offsets[leftBottom ? "t" : "b"] = size * cosr + labelWidth * sinr;
							}else{
								offsets[side] = size * sinr + labelWidth * cosr;
								offsets[leftBottom ? "b" : "t"] = size * cosr + labelWidth * sinr;
							}
							break;
					}
					offsets[side] += labelGap + Math.max(taMajorTick.length, taMinorTick.length) + (o.title ? (tsize + taTitleGap) : 0);
				}else{
					var side = leftBottom ? "b" : "t";
					switch(rotation){
						case 0:
						case 180:
							offsets[side] = size;
							offsets.l = offsets.r = labelWidth / 2;
							break;
						case 90:
						case 270:
							offsets[side] = labelWidth;
							offsets.l = offsets.r = size / 2;
							break;
						default:
							if((90 - centerAnchorLimit) <= rotation && rotation <= 90 || (270 - centerAnchorLimit) <= rotation && rotation <= 270){
								offsets[side] = size * sinr / 2 + labelWidth * cosr;
								offsets[leftBottom ? "r" : "l"] = size * cosr / 2 + labelWidth * sinr;
								offsets[leftBottom ? "l" : "r"] = size * cosr / 2;
							}else if(90 <= rotation && rotation <= (90 + centerAnchorLimit) || 270 <= rotation && rotation <= (270 + centerAnchorLimit)){
								offsets[side] = size * sinr / 2 + labelWidth * cosr;
								offsets[leftBottom ? "l" : "r"] = size * cosr / 2 + labelWidth * sinr;
								offsets[leftBottom ? "r" : "l"] = size * cosr / 2;
							}else if(rotation < centerAnchorLimit || (180 < rotation && rotation < (180 - centerAnchorLimit))){
								offsets[side] = size * sinr + labelWidth * cosr;
								offsets[leftBottom ? "r" : "l"] = size * cosr + labelWidth * sinr;
							}else{
								offsets[side] = size * sinr + labelWidth * cosr;
								offsets[leftBottom ? "l" : "r"] = size * cosr + labelWidth * sinr;
							}
							break;
					}
					offsets[side] += labelGap + Math.max(taMajorTick.length, taMinorTick.length) + (o.title ? (tsize + taTitleGap) : 0);
				}
			}
			if(labelWidth){
				this._cachedLabelWidth = labelWidth;
			}
			return offsets;	//	Object
		},
		cleanGroup: function(creator){
			if(this.opt.enableCache && this.group){
				this._lineFreePool = this._lineFreePool.concat(this._lineUsePool);
				this._lineUsePool = [];
				this._textFreePool = this._textFreePool.concat(this._textUsePool);
				this._textUsePool = [];
			}
			this.inherited(arguments);
		},
		createText: function(labelType, creator, x, y, align, textContent, font, fontColor, labelWidth){
			if(!this.opt.enableCache || labelType=="html"){
				return acommon.createText[labelType](
						this.chart,
						creator,
						x,
						y,
						align,
						textContent,
						font,
						fontColor,
						labelWidth
					);
			}
			var text;
			if (this._textFreePool.length > 0){
				text = this._textFreePool.pop();
				text.setShape({x: x, y: y, text: textContent, align: align});
				// For now all items share the same font, no need to re-set it
				//.setFont(font).setFill(fontColor);
				// was cleared, add it back
				creator.add(text);
			}else{
				text = acommon.createText[labelType](
						this.chart,
						creator,
						x,
						y,
						align,
						textContent,
						font,
						fontColor,
						labelWidth
					);			}
			this._textUsePool.push(text);
			return text;
		},
		createLine: function(creator, params){
			var line;
			if(this.opt.enableCache && this._lineFreePool.length > 0){
				line = this._lineFreePool.pop();
				line.setShape(params);
				// was cleared, add it back
				creator.add(line);
			}else{
				line = creator.createLine(params);
			}
			if(this.opt.enableCache){
				this._lineUsePool.push(line);
			}
			return line;
		},
		render: function(dim, offsets){
			//	summary:
			//		Render/draw the axis.
			//	dim: Object
			//		An object of the form { width, height}.
			//	offsets: Object
			//		An object of the form { l, r, t, b }.
			//	returns: dojox.charting.axis2d.Default
			//		The reference to the axis for functional chaining.
			if(!this.dirty){
				return this;	//	dojox.charting.axis2d.Default
			}
			// prepare variable
			var o = this.opt, ta = this.chart.theme.axis, leftBottom = o.leftBottom, rotation = o.rotation % 360,
				start, stop, titlePos, titleRotation=0, titleOffset, axisVector, tickVector, anchorOffset, labelOffset, labelAlign,

				// TODO: we use one font --- of major tick, we need to use major and minor fonts
				taFont = o.font || (ta.majorTick && ta.majorTick.font) || (ta.tick && ta.tick.font),
				taTitleFont = o.titleFont || (ta.tick && ta.tick.titleFont),
				// TODO: we use one font color --- we need to use different colors
				taFontColor = o.fontColor || (ta.majorTick && ta.majorTick.fontColor) || (ta.tick && ta.tick.fontColor) || "black",
				taTitleFontColor = o.titleFontColor || (ta.tick && ta.tick.titleFontColor) || "black",
				taTitleGap = (o.titleGap==0) ? 0 : o.titleGap || (ta.tick && ta.tick.titleGap) || 15,
				taTitleOrientation = o.titleOrientation || (ta.tick && ta.tick.titleOrientation) || "axis",
				taMajorTick = this.chart.theme.getTick("major", o),
				taMinorTick = this.chart.theme.getTick("minor", o),
				taMicroTick = this.chart.theme.getTick("micro", o),

				tickSize = Math.max(taMajorTick.length, taMinorTick.length, taMicroTick.length),
				taStroke = "stroke" in o ? o.stroke : ta.stroke,
				size = taFont ? g.normalizedLength(g.splitFontString(taFont).size) : 0,
				cosr = Math.abs(Math.cos(rotation * Math.PI / 180)),
				sinr = Math.abs(Math.sin(rotation * Math.PI / 180)),
				tsize = taTitleFont ? g.normalizedLength(g.splitFontString(taTitleFont).size) : 0;
			if(rotation < 0){
				rotation += 360;
			}
			if(this.vertical){
				start = {y: dim.height - offsets.b};
				stop  = {y: offsets.t};
				titlePos = {y: (dim.height - offsets.b + offsets.t)/2};
				titleOffset = size * sinr + (this._cachedLabelWidth || 0) * cosr + labelGap + Math.max(taMajorTick.length, taMinorTick.length) + tsize + taTitleGap;
				axisVector = {x: 0, y: -1};
				labelOffset = {x: 0, y: 0};
				tickVector = {x: 1, y: 0};
				anchorOffset = {x: labelGap, y: 0};
				switch(rotation){
					case 0:
						labelAlign = "end";
						labelOffset.y = size * 0.4;
						break;
					case 90:
						labelAlign = "middle";
						labelOffset.x = -size;
						break;
					case 180:
						labelAlign = "start";
						labelOffset.y = -size * 0.4;
						break;
					case 270:
						labelAlign = "middle";
						break;
					default:
						if(rotation < centerAnchorLimit){
							labelAlign = "end";
							labelOffset.y = size * 0.4;
						}else if(rotation < 90){
							labelAlign = "end";
							labelOffset.y = size * 0.4;
						}else if(rotation < (180 - centerAnchorLimit)){
							labelAlign = "start";
						}else if(rotation < (180 + centerAnchorLimit)){
							labelAlign = "start";
							labelOffset.y = -size * 0.4;
						}else if(rotation < 270){
							labelAlign = "start";
							labelOffset.x = leftBottom ? 0 : size * 0.4;
						}else if(rotation < (360 - centerAnchorLimit)){
							labelAlign = "end";
							labelOffset.x = leftBottom ? 0 : size * 0.4;
						}else{
							labelAlign = "end";
							labelOffset.y = size * 0.4;
						}
				}
				if(leftBottom){
					start.x = stop.x = offsets.l;
					titleRotation = (taTitleOrientation && taTitleOrientation == "away") ? 90 : 270;
					titlePos.x = offsets.l - titleOffset + (titleRotation == 270 ? tsize : 0);
					tickVector.x = -1;
					anchorOffset.x = -anchorOffset.x;
				}else{
					start.x = stop.x = dim.width - offsets.r;
					titleRotation = (taTitleOrientation && taTitleOrientation == "axis") ? 90 : 270;
					titlePos.x = dim.width - offsets.r + titleOffset - (titleRotation == 270 ? 0 : tsize);
					switch(labelAlign){
						case "start":
							labelAlign = "end";
							break;
						case "end":
							labelAlign = "start";
							break;
						case "middle":
							labelOffset.x += size;
							break;
					}
				}
			}else{
				start = {x: offsets.l};
				stop  = {x: dim.width - offsets.r};
				titlePos = {x: (dim.width - offsets.r + offsets.l)/2};
				titleOffset = size * cosr + (this._cachedLabelWidth || 0) * sinr + labelGap + Math.max(taMajorTick.length, taMinorTick.length) + tsize + taTitleGap;
				axisVector = {x: 1, y: 0};
				labelOffset = {x: 0, y: 0};
				tickVector = {x: 0, y: 1};
				anchorOffset = {x: 0, y: labelGap};
				switch(rotation){
					case 0:
						labelAlign = "middle";
						labelOffset.y = size;
						break;
					case 90:
						labelAlign = "start";
						labelOffset.x = -size * 0.4;
						break;
					case 180:
						labelAlign = "middle";
						break;
					case 270:
						labelAlign = "end";
						labelOffset.x = size * 0.4;
						break;
					default:
						if(rotation < (90 - centerAnchorLimit)){
							labelAlign = "start";
							labelOffset.y = leftBottom ? size : 0;
						}else if(rotation < (90 + centerAnchorLimit)){
							labelAlign = "start";
							labelOffset.x = -size * 0.4;
						}else if(rotation < 180){
							labelAlign = "start";
							labelOffset.y = leftBottom ? 0 : -size;
						}else if(rotation < (270 - centerAnchorLimit)){
							labelAlign = "end";
							labelOffset.y = leftBottom ? 0 : -size;
						}else if(rotation < (270 + centerAnchorLimit)){
							labelAlign = "end";
							labelOffset.y = leftBottom ? size * 0.4 : 0;
						}else{
							labelAlign = "end";
							labelOffset.y = leftBottom ? size : 0;
						}
				}
				if(leftBottom){
					start.y = stop.y = dim.height - offsets.b;
					titleRotation = (taTitleOrientation && taTitleOrientation == "axis") ? 180 : 0;
					titlePos.y = dim.height - offsets.b + titleOffset - (titleRotation ? tsize : 0);
				}else{
					start.y = stop.y = offsets.t;
					titleRotation = (taTitleOrientation && taTitleOrientation == "away") ? 180 : 0;
					titlePos.y = offsets.t - titleOffset + (titleRotation ? 0 : tsize);
					tickVector.y = -1;
					anchorOffset.y = -anchorOffset.y;
					switch(labelAlign){
						case "start":
							labelAlign = "end";
							break;
						case "end":
							labelAlign = "start";
							break;
						case "middle":
							labelOffset.y -= size;
							break;
					}
				}
			}

			// render shapes

			this.cleanGroup();

			try{
				var s = this.group,
					c = this.scaler,
					t = this.ticks,
					canLabel,
					f = lin.getTransformerFromModel(this.scaler),
					// GFX Canvas now supports labels, so let's _not_ fallback to HTML anymore on canvas, just use
					// HTML labels if explicitly asked + no rotation + no IE + no Opera
					labelType = (!o.title || !titleRotation) && !rotation && this.opt.htmlLabels && !has("ie") && !has("opera") ? "html" : "gfx",
					dx = tickVector.x * taMajorTick.length,
					dy = tickVector.y * taMajorTick.length;

				s.createLine({
					x1: start.x,
					y1: start.y,
					x2: stop.x,
					y2: stop.y
				}).setStroke(taStroke);
				
				//create axis title
				if(o.title){
					var axisTitle = acommon.createText[labelType](
						this.chart,
						s,
						titlePos.x,
						titlePos.y,
						"middle",
						o.title,
						taTitleFont,
						taTitleFontColor
					);
					if(labelType == "html"){
						this.htmlElements.push(axisTitle);
					}else{
						//as soon as rotation is provided, labelType won't be "html"
						//rotate gfx labels
						axisTitle.setTransform(g.matrix.rotategAt(titleRotation, titlePos.x, titlePos.y));
					}
				}
				
				// go out nicely instead of try/catch
				if(t==null){
					this.dirty = false;
					return this;
				}

				arr.forEach(t.major, function(tick){
					var offset = f(tick.value), elem,
						x = start.x + axisVector.x * offset,
						y = start.y + axisVector.y * offset;
						this.createLine(s, {
							x1: x, y1: y,
							x2: x + dx,
							y2: y + dy
						}).setStroke(taMajorTick);
						if(tick.label){
							var label = o.maxLabelCharCount ? this.getTextWithLimitCharCount(tick.label, taFont, o.maxLabelCharCount) : {
								text: tick.label,
								truncated: false
							};
							label = o.maxLabelSize ? this.getTextWithLimitLength(label.text, taFont, o.maxLabelSize, label.truncated) : label;
							elem = this.createText(labelType,
								s,
								x + dx + anchorOffset.x + (rotation ? 0 : labelOffset.x),
								y + dy + anchorOffset.y + (rotation ? 0 : labelOffset.y),
								labelAlign,
								label.text,
								taFont,
								taFontColor
								//this._cachedLabelWidth
							);
							
							// if bidi support was required, the textDir is "auto" and truncation
							// took place, we need to update the dir of the element for cases as: 
							// Fool label: 111111W (W for bidi character)
							// truncated label: 11... 
							// in this case for auto textDir the dir will be "ltr" which is wrong.
							if(this.chart.truncateBidi  && label.truncated){
								this.chart.truncateBidi(elem, tick.label, labelType);
							}
							label.truncated && this.labelTooltip(elem, this.chart, tick.label, label.text, taFont, labelType);
							if(labelType == "html"){
								this.htmlElements.push(elem);
							}else if(rotation){
								elem.setTransform([
									{dx: labelOffset.x, dy: labelOffset.y},
									g.matrix.rotategAt(
										rotation,
										x + dx + anchorOffset.x,
										y + dy + anchorOffset.y
									)
								]);
							}
						}
				}, this);

				dx = tickVector.x * taMinorTick.length;
				dy = tickVector.y * taMinorTick.length;
				canLabel = c.minMinorStep <= c.minor.tick * c.bounds.scale;
				arr.forEach(t.minor, function(tick){
					var offset = f(tick.value), elem,
						x = start.x + axisVector.x * offset,
						y = start.y + axisVector.y * offset;
						this.createLine(s, {
							x1: x, y1: y,
							x2: x + dx,
							y2: y + dy
						}).setStroke(taMinorTick);
						if(canLabel && tick.label){
							var label = o.maxLabelCharCount ? this.getTextWithLimitCharCount(tick.label, taFont, o.maxLabelCharCount) : {
								text: tick.label,
								truncated: false
							};
							label = o.maxLabelSize ? this.getTextWithLimitLength(label.text, taFont, o.maxLabelSize, label.truncated) : label;
							elem = this.createText(labelType,
								s,
								x + dx + anchorOffset.x + (rotation ? 0 : labelOffset.x),
								y + dy + anchorOffset.y + (rotation ? 0 : labelOffset.y),
								labelAlign,
								label.text,
								taFont,
								taFontColor
								//this._cachedLabelWidth
							);
							// if bidi support was required, the textDir is "auto" and truncation
							// took place, we need to update the dir of the element for cases as: 
							// Fool label: 111111W (W for bidi character)
							// truncated label: 11... 
							// in this case for auto textDir the dir will be "ltr" which is wrong.
							if(this.chart.getTextDir && label.truncated){
								this.chart.truncateBidi(elem, tick.label, labelType);
							}
							label.truncated && this.labelTooltip(elem, this.chart, tick.label, label.text, taFont, labelType);
							if(labelType == "html"){
								this.htmlElements.push(elem);
							}else if(rotation){
								elem.setTransform([
									{dx: labelOffset.x, dy: labelOffset.y},
									g.matrix.rotategAt(
										rotation,
										x + dx + anchorOffset.x,
										y + dy + anchorOffset.y
									)
								]);
							}
						}
				}, this);

				dx = tickVector.x * taMicroTick.length;
				dy = tickVector.y * taMicroTick.length;
				arr.forEach(t.micro, function(tick){
					var offset = f(tick.value), elem,
						x = start.x + axisVector.x * offset,
						y = start.y + axisVector.y * offset;
						this.createLine(s, {
							x1: x, y1: y,
							x2: x + dx,
							y2: y + dy
						}).setStroke(taMicroTick);
				}, this);
			}catch(e){
				// squelch
			}

			this.dirty = false;
			return this;	//	dojox.charting.axis2d.Default
		},
		labelTooltip: function(elem, chart, label, truncatedLabel, font, elemType){
			var modules = ["dijit/Tooltip"];
			var aroundRect = {type: "rect"}, position = ["above", "below"],
				fontWidth = g._base._getTextBox(truncatedLabel, {font: font}).w || 0,
				fontHeight = font ? g.normalizedLength(g.splitFontString(font).size) : 0;
			if(elemType == "html"){
				lang.mixin(aroundRect, html.coords(elem.firstChild, true));
				aroundRect.width = Math.ceil(fontWidth);
				aroundRect.height = Math.ceil(fontHeight);
				this._events.push({
					shape:  dojo,
					handle: connect.connect(elem.firstChild, "onmouseover", this, function(e){
						require(modules, function(Tooltip){
							Tooltip.show(label, aroundRect, position);
						});
					})
				});
				this._events.push({
					shape:  dojo,
					handle: connect.connect(elem.firstChild, "onmouseout", this, function(e){
						require(modules, function(Tooltip){
							Tooltip.hide(aroundRect);
						});
					})
				});
			}else{
				var shp = elem.getShape(),
					lt = html.coords(chart.node, true);
				aroundRect = lang.mixin(aroundRect, {
					x: shp.x - fontWidth / 2,
					y: shp.y
				});
				aroundRect.x += lt.x;
				aroundRect.y += lt.y;
				aroundRect.x = Math.round(aroundRect.x);
				aroundRect.y = Math.round(aroundRect.y);
				aroundRect.width = Math.ceil(fontWidth);
				aroundRect.height = Math.ceil(fontHeight);
				this._events.push({
					shape:  elem,
					handle: elem.connect("onmouseenter", this, function(e){
						require(modules, function(Tooltip){
							Tooltip.show(label, aroundRect, position);
						});
					})
				});
				this._events.push({
					shape:  elem,
					handle: elem.connect("onmouseleave", this, function(e){
						require(modules, function(Tooltip){
							Tooltip.hide(aroundRect);
						});
					})
				});
			}
		}
	});
});

},
'dojo/has':function(){
define(["require"], function(require) {
	// module:
	//		dojo/has
	// summary:
	//		Defines the has.js API and several feature tests used by dojo.
	// description:
	//		This module defines the has API as described by the project has.js with the following additional features:
	//
	//			* the has test cache is exposed at has.cache.
	//			* the method has.add includes a forth parameter that controls whether or not existing tests are replaced
	//			* the loader's has cache may be optionally copied into this module's has cahce.
	//
	//		This module adopted from https://github.com/phiggins42/has.js; thanks has.js team!

	// try to pull the has implementation from the loader; both the dojo loader and bdLoad provide one
	// WARNING: if a foreign loader defines require.has to be something other than the has.js API, then this implementation fail
	var has = require.has || function(){};
	if(!1){
		// notice the condition is written so that if 1 is transformed to 1 during a build
		// the conditional will be (!1 && typeof has=="function") which is statically false and the closure
		// compiler will discard the block.
		var
			isBrowser =
				// the most fundamental decision: are we in the browser?
				typeof window != "undefined" &&
				typeof location != "undefined" &&
				typeof document != "undefined" &&
				window.location == location && window.document == document,

			// has API variables
			global = this,
			doc = isBrowser && document,
			element = doc && doc.createElement("DiV"),
			cache = {};

		has = /*===== dojo.has= =====*/ function(name){
			//	summary:
			//		Return the current value of the named feature.
			//
			//	name: String|Integer
			//		The name (if a string) or identifier (if an integer) of the feature to test.
			//
			//	description:
			//		Returns the value of the feature named by name. The feature must have been
			//		previously added to the cache by has.add.

			return typeof cache[name] == "function" ? (cache[name] = cache[name](global, doc, element)) : cache[name]; // Boolean
		};

		has.cache = cache;

		has.add = /*====== dojo.has.add= ======*/ function(name, test, now, force){
			// summary:
			//	 Register a new feature test for some named feature.
			//
			// name: String|Integer
			//	 The name (if a string) or identifier (if an integer) of the feature to test.
			//
			// test: Function
			//	 A test function to register. If a function, queued for testing until actually
			//	 needed. The test function should return a boolean indicating
			//	 the presence of a feature or bug.
			//
			// now: Boolean?
			//	 Optional. Omit if `test` is not a function. Provides a way to immediately
			//	 run the test and cache the result.
			//
			// force: Boolean?
			//	 Optional. If the test already exists and force is truthy, then the existing
			//	 test will be replaced; otherwise, add does not replace an existing test (that
			//	 is, by default, the first test advice wins).
			//
			// example:
			//			A redundant test, testFn with immediate execution:
			//	|				has.add("javascript", function(){ return true; }, true);
			//
			// example:
			//			Again with the redundantness. You can do this in your tests, but we should
			//			not be doing this in any internal has.js tests
			//	|				has.add("javascript", true);
			//
			// example:
			//			Three things are passed to the testFunction. `global`, `document`, and a generic element
			//			from which to work your test should the need arise.
			//	|				has.add("bug-byid", function(g, d, el){
			//	|						// g	== global, typically window, yadda yadda
			//	|						// d	== document object
			//	|						// el == the generic element. a `has` element.
			//	|						return false; // fake test, byid-when-form-has-name-matching-an-id is slightly longer
			//	|				});

			(typeof cache[name]=="undefined" || force) && (cache[name]= test);
			return now && has(name);
		};

		// since we're operating under a loader that doesn't provide a has API, we must explicitly initialize
		// has as it would have otherwise been initialized by the dojo loader; use has.add to the builder
		// can optimize these away iff desired
		true || has.add("host-browser", isBrowser);
		true || has.add("dom", isBrowser);
		true || has.add("dojo-dom-ready-api", 1);
		true || has.add("dojo-sniff", 1);
	}

	if(1){
		var agent = navigator.userAgent;
		// Common application level tests
		has.add("dom-addeventlistener", !!document.addEventListener);
		has.add("touch", "ontouchstart" in document);
		// I don't know if any of these tests are really correct, just a rough guess
		has.add("device-width", screen.availWidth || innerWidth);
		has.add("agent-ios", !!agent.match(/iPhone|iP[ao]d/));
		has.add("agent-android", agent.indexOf("android") > 1);
	}

	has.clearElement = /*===== dojo.has.clearElement= ======*/ function(element) {
		// summary:
		//	 Deletes the contents of the element passed to test functions.
		element.innerHTML= "";
		return element;
	};

	has.normalize = /*===== dojo.has.normalize= ======*/ function(id, toAbsMid){
		// summary:
		//	 Resolves id into a module id based on possibly-nested tenary expression that branches on has feature test value(s).
		//
		// toAbsMid: Function
		//	 Resolves a relative module id into an absolute module id
		var
			tokens = id.match(/[\?:]|[^:\?]*/g), i = 0,
			get = function(skip){
				var term = tokens[i++];
				if(term == ":"){
					// empty string module name, resolves to 0
					return 0;
				}else{
					// postfixed with a ? means it is a feature to branch on, the term is the name of the feature
					if(tokens[i++] == "?"){
						if(!skip && has(term)){
							// matched the feature, get the first value from the options
							return get();
						}else{
							// did not match, get the second value, passing over the first
							get(true);
							return get(skip);
						}
					}
					// a module
					return term || 0;
				}
			};
		id = get();
		return id && toAbsMid(id);
	};

	has.load = /*===== dojo.has.load= ======*/ function(id, parentRequire, loaded){
		// summary:
		//	 Conditional loading of AMD modules based on a has feature test value.
		//
		// id: String
		//	 Gives the resolved module id to load.
		//
		// parentRequire: Function
		//	 The loader require function with respect to the module that contained the plugin resource in it's
		//	 dependency list.
		//
		// loaded: Function
		//	 Callback to loader that consumes result of plugin demand.

		if(id){
			parentRequire([id], loaded);
		}else{
			loaded();
		}
	};

	return has;
});

},
'dojo/colors':function(){
define(["./_base/kernel", "./_base/lang", "./_base/Color", "./_base/array"], function(dojo, lang, Color, ArrayUtil) {
	// module:
	//		dojo/colors
	// summary:
	//		TODOC

	var ColorExt = lang.getObject("dojo.colors", true);

//TODO: this module appears to break naming conventions

/*=====
	lang.mixin(dojo, {
		colors: {
			// summary: Color utilities, extending Base dojo.Color
		}
	});
=====*/

	// this is a standard conversion prescribed by the CSS3 Color Module
	var hue2rgb = function(m1, m2, h){
		if(h < 0){ ++h; }
		if(h > 1){ --h; }
		var h6 = 6 * h;
		if(h6 < 1){ return m1 + (m2 - m1) * h6; }
		if(2 * h < 1){ return m2; }
		if(3 * h < 2){ return m1 + (m2 - m1) * (2 / 3 - h) * 6; }
		return m1;
	};
	// Override base Color.fromRgb with the impl in this module
	dojo.colorFromRgb = Color.fromRgb = function(/*String*/ color, /*dojo.Color?*/ obj){
		// summary:
		//		get rgb(a) array from css-style color declarations
		// description:
		//		this function can handle all 4 CSS3 Color Module formats: rgb,
		//		rgba, hsl, hsla, including rgb(a) with percentage values.
		var m = color.toLowerCase().match(/^(rgba?|hsla?)\(([\s\.\-,%0-9]+)\)/);
		if(m){
			var c = m[2].split(/\s*,\s*/), l = c.length, t = m[1], a;
			if((t == "rgb" && l == 3) || (t == "rgba" && l == 4)){
				var r = c[0];
				if(r.charAt(r.length - 1) == "%"){
					// 3 rgb percentage values
					a = ArrayUtil.map(c, function(x){
						return parseFloat(x) * 2.56;
					});
					if(l == 4){ a[3] = c[3]; }
					return Color.fromArray(a, obj); // dojo.Color
				}
				return Color.fromArray(c, obj); // dojo.Color
			}
			if((t == "hsl" && l == 3) || (t == "hsla" && l == 4)){
				// normalize hsl values
				var H = ((parseFloat(c[0]) % 360) + 360) % 360 / 360,
					S = parseFloat(c[1]) / 100,
					L = parseFloat(c[2]) / 100,
					// calculate rgb according to the algorithm
					// recommended by the CSS3 Color Module
					m2 = L <= 0.5 ? L * (S + 1) : L + S - L * S,
					m1 = 2 * L - m2;
				a = [
					hue2rgb(m1, m2, H + 1 / 3) * 256,
					hue2rgb(m1, m2, H) * 256,
					hue2rgb(m1, m2, H - 1 / 3) * 256,
					1
				];
				if(l == 4){ a[3] = c[3]; }
				return Color.fromArray(a, obj); // dojo.Color
			}
		}
		return null;	// dojo.Color
	};

	var confine = function(c, low, high){
		// summary:
		//		sanitize a color component by making sure it is a number,
		//		and clamping it to valid values
		c = Number(c);
		return isNaN(c) ? high : c < low ? low : c > high ? high : c;	// Number
	};

	Color.prototype.sanitize = function(){
		// summary: makes sure that the object has correct attributes
		var t = this;
		t.r = Math.round(confine(t.r, 0, 255));
		t.g = Math.round(confine(t.g, 0, 255));
		t.b = Math.round(confine(t.b, 0, 255));
		t.a = confine(t.a, 0, 1);
		return this;	// dojo.Color
	};

	ColorExt.makeGrey = Color.makeGrey = function(/*Number*/ g, /*Number?*/ a){
		// summary: creates a greyscale color with an optional alpha
		return Color.fromArray([g, g, g, a]);	// dojo.Color
	};

	// mixin all CSS3 named colors not already in _base, along with SVG 1.0 variant spellings
	lang.mixin(Color.named, {
		"aliceblue":	[240,248,255],
		"antiquewhite": [250,235,215],
		"aquamarine":	[127,255,212],
		"azure":	[240,255,255],
		"beige":	[245,245,220],
		"bisque":	[255,228,196],
		"blanchedalmond":	[255,235,205],
		"blueviolet":	[138,43,226],
		"brown":	[165,42,42],
		"burlywood":	[222,184,135],
		"cadetblue":	[95,158,160],
		"chartreuse":	[127,255,0],
		"chocolate":	[210,105,30],
		"coral":	[255,127,80],
		"cornflowerblue":	[100,149,237],
		"cornsilk": [255,248,220],
		"crimson":	[220,20,60],
		"cyan": [0,255,255],
		"darkblue": [0,0,139],
		"darkcyan": [0,139,139],
		"darkgoldenrod":	[184,134,11],
		"darkgray": [169,169,169],
		"darkgreen":	[0,100,0],
		"darkgrey": [169,169,169],
		"darkkhaki":	[189,183,107],
		"darkmagenta":	[139,0,139],
		"darkolivegreen":	[85,107,47],
		"darkorange":	[255,140,0],
		"darkorchid":	[153,50,204],
		"darkred":	[139,0,0],
		"darksalmon":	[233,150,122],
		"darkseagreen": [143,188,143],
		"darkslateblue":	[72,61,139],
		"darkslategray":	[47,79,79],
		"darkslategrey":	[47,79,79],
		"darkturquoise":	[0,206,209],
		"darkviolet":	[148,0,211],
		"deeppink": [255,20,147],
		"deepskyblue":	[0,191,255],
		"dimgray":	[105,105,105],
		"dimgrey":	[105,105,105],
		"dodgerblue":	[30,144,255],
		"firebrick":	[178,34,34],
		"floralwhite":	[255,250,240],
		"forestgreen":	[34,139,34],
		"gainsboro":	[220,220,220],
		"ghostwhite":	[248,248,255],
		"gold": [255,215,0],
		"goldenrod":	[218,165,32],
		"greenyellow":	[173,255,47],
		"grey": [128,128,128],
		"honeydew": [240,255,240],
		"hotpink":	[255,105,180],
		"indianred":	[205,92,92],
		"indigo":	[75,0,130],
		"ivory":	[255,255,240],
		"khaki":	[240,230,140],
		"lavender": [230,230,250],
		"lavenderblush":	[255,240,245],
		"lawngreen":	[124,252,0],
		"lemonchiffon": [255,250,205],
		"lightblue":	[173,216,230],
		"lightcoral":	[240,128,128],
		"lightcyan":	[224,255,255],
		"lightgoldenrodyellow": [250,250,210],
		"lightgray":	[211,211,211],
		"lightgreen":	[144,238,144],
		"lightgrey":	[211,211,211],
		"lightpink":	[255,182,193],
		"lightsalmon":	[255,160,122],
		"lightseagreen":	[32,178,170],
		"lightskyblue": [135,206,250],
		"lightslategray":	[119,136,153],
		"lightslategrey":	[119,136,153],
		"lightsteelblue":	[176,196,222],
		"lightyellow":	[255,255,224],
		"limegreen":	[50,205,50],
		"linen":	[250,240,230],
		"magenta":	[255,0,255],
		"mediumaquamarine": [102,205,170],
		"mediumblue":	[0,0,205],
		"mediumorchid": [186,85,211],
		"mediumpurple": [147,112,219],
		"mediumseagreen":	[60,179,113],
		"mediumslateblue":	[123,104,238],
		"mediumspringgreen":	[0,250,154],
		"mediumturquoise":	[72,209,204],
		"mediumvioletred":	[199,21,133],
		"midnightblue": [25,25,112],
		"mintcream":	[245,255,250],
		"mistyrose":	[255,228,225],
		"moccasin": [255,228,181],
		"navajowhite":	[255,222,173],
		"oldlace":	[253,245,230],
		"olivedrab":	[107,142,35],
		"orange":	[255,165,0],
		"orangered":	[255,69,0],
		"orchid":	[218,112,214],
		"palegoldenrod":	[238,232,170],
		"palegreen":	[152,251,152],
		"paleturquoise":	[175,238,238],
		"palevioletred":	[219,112,147],
		"papayawhip":	[255,239,213],
		"peachpuff":	[255,218,185],
		"peru": [205,133,63],
		"pink": [255,192,203],
		"plum": [221,160,221],
		"powderblue":	[176,224,230],
		"rosybrown":	[188,143,143],
		"royalblue":	[65,105,225],
		"saddlebrown":	[139,69,19],
		"salmon":	[250,128,114],
		"sandybrown":	[244,164,96],
		"seagreen": [46,139,87],
		"seashell": [255,245,238],
		"sienna":	[160,82,45],
		"skyblue":	[135,206,235],
		"slateblue":	[106,90,205],
		"slategray":	[112,128,144],
		"slategrey":	[112,128,144],
		"snow": [255,250,250],
		"springgreen":	[0,255,127],
		"steelblue":	[70,130,180],
		"tan":	[210,180,140],
		"thistle":	[216,191,216],
		"tomato":	[255,99,71],
		"turquoise":	[64,224,208],
		"violet":	[238,130,238],
		"wheat":	[245,222,179],
		"whitesmoke":	[245,245,245],
		"yellowgreen":	[154,205,50]
	});

	return Color;
});

},
'dojo/_base/sniff':function(){
define(["./kernel", "../has"], function(dojo, has){
	// module:
	//		dojo/sniff
	// summary:
	//		This module populates the dojo browser version sniffing properties.

	if(!1){
		return has;
	}

	dojo.isBrowser = true,
	dojo._name = "browser";

	var hasAdd = has.add,
		n = navigator,
		dua = n.userAgent,
		dav = n.appVersion,
		tv = parseFloat(dav),
		isOpera,
		isAIR,
		isKhtml,
		isWebKit,
		isChrome,
		isMac,
		isSafari,
		isMozilla ,
		isMoz,
		isIE,
		isFF,
		isQuirks,
		isIos,
		isAndroid,
		isWii;

	/*=====
	dojo.isBrowser = {
		//	example:
		//	| if(dojo.isBrowser){ ... }
	};

	dojo.isFF = {
		//	example:
		//	| if(dojo.isFF > 1){ ... }
	};

	dojo.isIE = {
		// example:
		//	| if(dojo.isIE > 6){
		//	|		// we are IE7
		//	| }
	};

	dojo.isSafari = {
		//	example:
		//	| if(dojo.isSafari){ ... }
		//	example:
		//		Detect iPhone:
		//	| if(dojo.isSafari && navigator.userAgent.indexOf("iPhone") != -1){
		//	|		// we are iPhone. Note, iPod touch reports "iPod" above and fails this test.
		//	| }
	};

	dojo.mixin(dojo, {
		// isBrowser: Boolean
		//		True if the client is a web-browser
		isBrowser: true,
		//	isFF: Number | undefined
		//		Version as a Number if client is FireFox. undefined otherwise. Corresponds to
		//		major detected FireFox version (1.5, 2, 3, etc.)
		isFF: 2,
		//	isIE: Number | undefined
		//		Version as a Number if client is MSIE(PC). undefined otherwise. Corresponds to
		//		major detected IE version (6, 7, 8, etc.)
		isIE: 6,
		//	isKhtml: Number | undefined
		//		Version as a Number if client is a KHTML browser. undefined otherwise. Corresponds to major
		//		detected version.
		isKhtml: 0,
		//	isWebKit: Number | undefined
		//		Version as a Number if client is a WebKit-derived browser (Konqueror,
		//		Safari, Chrome, etc.). undefined otherwise.
		isWebKit: 0,
		//	isMozilla: Number | undefined
		//		Version as a Number if client is a Mozilla-based browser (Firefox,
		//		SeaMonkey). undefined otherwise. Corresponds to major detected version.
		isMozilla: 0,
		//	isOpera: Number | undefined
		//		Version as a Number if client is Opera. undefined otherwise. Corresponds to
		//		major detected version.
		isOpera: 0,
		//	isSafari: Number | undefined
		//		Version as a Number if client is Safari or iPhone. undefined otherwise.
		isSafari: 0,
		//	isChrome: Number | undefined
		//		Version as a Number if client is Chrome browser. undefined otherwise.
		isChrome: 0,
		//	isMac: Boolean
		//		True if the client runs on Mac
		isMac: 0,
		// isIos: Boolean
		//		True if client is iPhone, iPod, or iPad
		isIos: 0,
		// isAndroid: Number | undefined
		//		Version as a Number if client is android browser. undefined otherwise.
		isAndroid: 0,
		// isWii: Boolean
		//		True if client is Wii
		isWii: 0
	});
	=====*/

	// fill in the rendering support information in dojo.render.*
	if(dua.indexOf("AdobeAIR") >= 0){ isAIR = 1; }
	isKhtml = (dav.indexOf("Konqueror") >= 0) ? tv : 0;
	isWebKit = parseFloat(dua.split("WebKit/")[1]) || undefined;
	isChrome = parseFloat(dua.split("Chrome/")[1]) || undefined;
	isMac = dav.indexOf("Macintosh") >= 0;
	isIos = /iPhone|iPod|iPad/.test(dua);
	isAndroid = parseFloat(dua.split("Android ")[1]) || undefined;
	isWii = typeof opera != "undefined" && opera.wiiremote;

	// safari detection derived from:
	//		http://developer.apple.com/internet/safari/faq.html#anchor2
	//		http://developer.apple.com/internet/safari/uamatrix.html
	var index = Math.max(dav.indexOf("WebKit"), dav.indexOf("Safari"), 0);
	if(index && !isChrome){
		// try to grab the explicit Safari version first. If we don't get
		// one, look for less than 419.3 as the indication that we're on something
		// "Safari 2-ish".
		isSafari = parseFloat(dav.split("Version/")[1]);
		if(!isSafari || parseFloat(dav.substr(index + 7)) <= 419.3){
			isSafari = 2;
		}
	}

	if (!has("dojo-webkit")) {
		if(dua.indexOf("Opera") >= 0){
			isOpera = tv;
			// see http://dev.opera.com/articles/view/opera-ua-string-changes and http://www.useragentstring.com/pages/Opera/
			// 9.8 has both styles; <9.8, 9.9 only old style
			if(isOpera >= 9.8){
				isOpera = parseFloat(dua.split("Version/")[1]) || tv;
			}
		}

		if(dua.indexOf("Gecko") >= 0 && !isKhtml && !isWebKit){
			isMozilla = isMoz = tv;
		}
		if(isMoz){
			//We really need to get away from this. Consider a sane isGecko approach for the future.
			isFF = parseFloat(dua.split("Firefox/")[1] || dua.split("Minefield/")[1]) || undefined;
		}
		if(document.all && !isOpera){
			isIE = parseFloat(dav.split("MSIE ")[1]) || undefined;
			//In cases where the page has an HTTP header or META tag with
			//X-UA-Compatible, then it is in emulation mode.
			//Make sure isIE reflects the desired version.
			//document.documentMode of 5 means quirks mode.
			//Only switch the value if documentMode's major version
			//is different from isIE's major version.
			var mode = document.documentMode;
			if(mode && mode != 5 && Math.floor(isIE) != mode){
				isIE = mode;
			}
		}
	}

	isQuirks = document.compatMode == "BackCompat";

	hasAdd("opera", dojo.isOpera = isOpera);
	hasAdd("air", dojo.isAIR = isAIR);
	hasAdd("khtml", dojo.isKhtml = isKhtml);
	hasAdd("webkit", dojo.isWebKit = isWebKit);
	hasAdd("chrome", dojo.isChrome = isChrome);
	hasAdd("mac", dojo.isMac = isMac );
	hasAdd("safari", dojo.isSafari = isSafari);
	hasAdd("mozilla", dojo.isMozilla = dojo.isMoz = isMozilla );
	hasAdd("ie", dojo.isIE = isIE );
	hasAdd("ff", dojo.isFF = isFF);
	hasAdd("quirks", dojo.isQuirks = isQuirks);
	hasAdd("ios", dojo.isIos = isIos);
	hasAdd("android", dojo.isAndroid = isAndroid);

	dojo.locale = dojo.locale || (isIE ? n.userLanguage : n.language).toLowerCase();

	return has;
});

},
'dojo/_base/window':function(){
define(["./kernel", "../has", "./sniff"], function(dojo, has){
	// module:
	//		dojo/window
	// summary:
	//		This module provides an API to save/set/restore the global/document scope.

/*=====
dojo.doc = {
	// summary:
	//		Alias for the current document. 'dojo.doc' can be modified
	//		for temporary context shifting. Also see dojo.withDoc().
	// description:
	//		Refer to dojo.doc rather
	//		than referring to 'window.document' to ensure your code runs
	//		correctly in managed contexts.
	// example:
	//	|	n.appendChild(dojo.doc.createElement('div'));
}
=====*/
dojo.doc = this["document"] || null;

dojo.body = function(){
	// summary:
	//		Return the body element of the document
	//		return the body object associated with dojo.doc
	// example:
	//	|	dojo.body().appendChild(dojo.doc.createElement('div'));

	// Note: document.body is not defined for a strict xhtml document
	// Would like to memoize this, but dojo.doc can change vi dojo.withDoc().
	return dojo.doc.body || dojo.doc.getElementsByTagName("body")[0]; // Node
};

dojo.setContext = function(/*Object*/globalObject, /*DocumentElement*/globalDocument){
	// summary:
	//		changes the behavior of many core Dojo functions that deal with
	//		namespace and DOM lookup, changing them to work in a new global
	//		context (e.g., an iframe). The varibles dojo.global and dojo.doc
	//		are modified as a result of calling this function and the result of
	//		`dojo.body()` likewise differs.
	dojo.global = ret.global = globalObject;
	dojo.doc = ret.doc = globalDocument;
};

dojo.withGlobal = function(	/*Object*/globalObject,
							/*Function*/callback,
							/*Object?*/thisObject,
							/*Array?*/cbArguments){
	// summary:
	//		Invoke callback with globalObject as dojo.global and
	//		globalObject.document as dojo.doc.
	// description:
	//		Invoke callback with globalObject as dojo.global and
	//		globalObject.document as dojo.doc. If provided, globalObject
	//		will be executed in the context of object thisObject
	//		When callback() returns or throws an error, the dojo.global
	//		and dojo.doc will be restored to its previous state.

	var oldGlob = dojo.global;
	try{
		dojo.global = ret.global = globalObject;
		return dojo.withDoc.call(null, globalObject.document, callback, thisObject, cbArguments);
	}finally{
		dojo.global = ret.global = oldGlob;
	}
};

dojo.withDoc = function(	/*DocumentElement*/documentObject,
							/*Function*/callback,
							/*Object?*/thisObject,
							/*Array?*/cbArguments){
	// summary:
	//		Invoke callback with documentObject as dojo.doc.
	// description:
	//		Invoke callback with documentObject as dojo.doc. If provided,
	//		callback will be executed in the context of object thisObject
	//		When callback() returns or throws an error, the dojo.doc will
	//		be restored to its previous state.

	var oldDoc = dojo.doc,
		oldQ = dojo.isQuirks,
		oldIE = dojo.isIE, isIE, mode, pwin;

	try{
		dojo.doc = ret.doc = documentObject;
		// update dojo.isQuirks and the value of the has feature "quirks"
		dojo.isQuirks = has.add("quirks", dojo.doc.compatMode == "BackCompat", true, true); // no need to check for QuirksMode which was Opera 7 only

		if(has("ie")){
			if((pwin = documentObject.parentWindow) && pwin.navigator){
				// re-run IE detection logic and update dojo.isIE / has("ie")
				// (the only time parentWindow/navigator wouldn't exist is if we were not
				// passed an actual legitimate document object)
				isIE = parseFloat(pwin.navigator.appVersion.split("MSIE ")[1]) || undefined;
				mode = documentObject.documentMode;
				if(mode && mode != 5 && Math.floor(isIE) != mode){
					isIE = mode;
				}
				dojo.isIE = has.add("ie", isIE, true, true);
			}
		}

		if(thisObject && typeof callback == "string"){
			callback = thisObject[callback];
		}

		return callback.apply(thisObject, cbArguments || []);
	}finally{
		dojo.doc = ret.doc = oldDoc;
		dojo.isQuirks = has.add("quirks", oldQ, true, true);
		dojo.isIE = has.add("ie", oldIE, true, true);
	}
};

var ret = {
	global: dojo.global,
	doc: dojo.doc,
	body: dojo.body,
	setContext: dojo.setContext,
	withGlobal: dojo.withGlobal,
	withDoc: dojo.withDoc
};

return ret;

});

},
'dojox/charting/Element':function(){
define("dojox/charting/Element", ["dojo/_base/lang", "dojo/_base/array", "dojo/dom-construct","dojo/_base/declare", "dojox/gfx", "dojox/gfx/utils", "dojox/gfx/shape"],
	function(lang, arr, domConstruct, declare, gfx, utils, shape){
	
	return declare("dojox.charting.Element", null, {
		//	summary:
		//		A base class that is used to build other elements of a chart, such as
		//		a series.
		//	chart: dojox.charting.Chart
		//		The parent chart for this element.
		//	group: dojox.gfx.Group
		//		The visual GFX group representing this element.
		//	htmlElement: Array
		//		Any DOMNodes used as a part of this element (such as HTML-based labels).
		//	dirty: Boolean
		//		A flag indicating whether or not this element needs to be rendered.
	
		chart: null,
		group: null,
		htmlElements: null,
		dirty: true,
	
		constructor: function(chart){
			//	summary:
			//		Creates a new charting element.
			//	chart: dojox.charting.Chart
			//		The chart that this element belongs to.
			this.chart = chart;
			this.group = null;
			this.htmlElements = [];
			this.dirty = true;
			this.trailingSymbol = "...";
			this._events = [];
		},
		createGroup: function(creator){
			//	summary:
			//		Convenience function to create a new dojox.gfx.Group.
			//	creator: dojox.gfx.Surface?
			//		An optional surface in which to create this group.
			//	returns: dojox.charting.Element
			//		A reference to this object for functional chaining.
			if(!creator){ creator = this.chart.surface; }
			if(!this.group){
				this.group = creator.createGroup();
			}
			return this;	//	dojox.charting.Element
		},
		purgeGroup: function(){
			//	summary:
			//		Clear any elements out of our group, and destroy the group.
			//	returns: dojox.charting.Element
			//		A reference to this object for functional chaining.
			this.destroyHtmlElements();
			if(this.group){
				// since 1.7.x we need dispose shape otherwise there is a memoryleak
				utils.forEach(this.group, function(child){
					shape.dispose(child);
				});
				this.group.clear();
				this.group.removeShape();
				this.group = null;
			}
			this.dirty = true;
			if(this._events.length){
				arr.forEach(this._events, function(item){
					item.shape.disconnect(item.handle);
				});
				this._events = [];
			}
			return this;	//	dojox.charting.Element
		},
		cleanGroup: function(creator){
			//	summary:
			//		Clean any elements (HTML or GFX-based) out of our group, and create a new one.
			//	creator: dojox.gfx.Surface?
			//		An optional surface to work with.
			//	returns: dojox.charting.Element
			//		A reference to this object for functional chaining.
			this.destroyHtmlElements();
			if(!creator){ creator = this.chart.surface; }
			if(this.group){
				utils.forEach(this.group, function(child){
					shape.dispose(child);
				});
				this.group.clear();
			}else{
				this.group = creator.createGroup();
			}
			this.dirty = true;
			return this;	//	dojox.charting.Element
		},
		destroyHtmlElements: function(){
			//	summary:
			//		Destroy any DOMNodes that may have been created as a part of this element.
			if(this.htmlElements.length){
				arr.forEach(this.htmlElements, domConstruct.destroy);
				this.htmlElements = [];
			}
		},
		destroy: function(){
			//	summary:
			//		API addition to conform to the rest of the Dojo Toolkit's standard.
			this.purgeGroup();
		},
		//text utilities
		getTextWidth: function(s, font){
			return gfx._base._getTextBox(s, {font: font}).w || 0;
		},
		getTextWithLimitLength: function(s, font, limitWidth, truncated){
			//	summary:
			//		Get the truncated string based on the limited width in px(dichotomy algorithm)
			//	s: String?
			//		candidate text.
			//	font: String?
			//		text's font style.
			//	limitWidth: Number?
			//		text limited width in px.
			//	truncated: Boolean?
			//		whether the input text(s) has already been truncated.
			//	returns: Object
			//		{
			//			text: processed text, maybe truncated or not
			//			truncated: whether text has been truncated
			//		}
			if (!s || s.length <= 0) {
				return {
					text: "",
					truncated: truncated || false
				};
			}
			if(!limitWidth || limitWidth <= 0){
				return {
					text: s,
					truncated: truncated || false
				};
			}
			var delta = 2,
				//golden section for dichotomy algorithm
				trucPercentage = 0.618,
				minStr = s.substring(0,1) + this.trailingSymbol,
				minWidth = this.getTextWidth(minStr, font);
			if (limitWidth <= minWidth) {
				return {
					text: minStr,
					truncated: true
				};
			}
			var width = this.getTextWidth(s, font);
			if(width <= limitWidth){
				return {
					text: s,
					truncated: truncated || false
				};
			}else{
				var begin = 0,
					end = s.length;
				while(begin < end){
					if(end - begin <= delta ){
						while (this.getTextWidth(s.substring(0, begin) + this.trailingSymbol, font) > limitWidth) {
							begin -= 1;
						}
						return {
							text: (s.substring(0,begin) + this.trailingSymbol),
							truncated: true
						};
					}
					var index = begin + Math.round((end - begin) * trucPercentage),
						widthIntercepted = this.getTextWidth(s.substring(0, index), font);
					if(widthIntercepted < limitWidth){
						begin = index;
						end = end;
					}else{
						begin = begin;
						end = index;
					}
				}
			}
		},
		getTextWithLimitCharCount: function(s, font, wcLimit, truncated){
			//	summary:
			//		Get the truncated string based on the limited character count(dichotomy algorithm)
			//	s: String?
			//		candidate text.
			//	font: String?
			//		text's font style.
			//	wcLimit: Number?
			//		text limited character count.
			//	truncated: Boolean?
			//		whether the input text(s) has already been truncated.
			//	returns: Object
			//		{
			//			text: processed text, maybe truncated or not
			//			truncated: whether text has been truncated
			//		}
			if (!s || s.length <= 0) {
				return {
					text: "",
					truncated: truncated || false
				};
			}
			if(!wcLimit || wcLimit <= 0 || s.length <= wcLimit){
				return {
					text: s,
					truncated: truncated || false
				};
			}
			return {
				text: s.substring(0, wcLimit) + this.trailingSymbol,
				truncated: true
			};
		},
		// fill utilities
		_plotFill: function(fill, dim, offsets){
			// process a plot-wide fill
			if(!fill || !fill.type || !fill.space){
				return fill;
			}
			var space = fill.space;
			switch(fill.type){
				case "linear":
					if(space === "plot" || space === "shapeX" || space === "shapeY"){
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultLinearGradient, fill);
						fill.space = space;
						// process dimensions
						if(space === "plot" || space === "shapeX"){
							// process Y
							var span = dim.height - offsets.t - offsets.b;
							fill.y1 = offsets.t + span * fill.y1 / 100;
							fill.y2 = offsets.t + span * fill.y2 / 100;
						}
						if(space === "plot" || space === "shapeY"){
							// process X
							var span = dim.width - offsets.l - offsets.r;
							fill.x1 = offsets.l + span * fill.x1 / 100;
							fill.x2 = offsets.l + span * fill.x2 / 100;
						}
					}
					break;
				case "radial":
					if(space === "plot"){
						// this one is used exclusively for scatter charts
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultRadialGradient, fill);
						fill.space = space;
						// process both dimensions
						var spanX = dim.width  - offsets.l - offsets.r,
							spanY = dim.height - offsets.t - offsets.b;
						fill.cx = offsets.l + spanX * fill.cx / 100;
						fill.cy = offsets.t + spanY * fill.cy / 100;
						fill.r  = fill.r * Math.sqrt(spanX * spanX + spanY * spanY) / 200;
					}
					break;
				case "pattern":
					if(space === "plot" || space === "shapeX" || space === "shapeY"){
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultPattern, fill);
						fill.space = space;
						// process dimensions
						if(space === "plot" || space === "shapeX"){
							// process Y
							var span = dim.height - offsets.t - offsets.b;
							fill.y = offsets.t + span * fill.y / 100;
							fill.height = span * fill.height / 100;
						}
						if(space === "plot" || space === "shapeY"){
							// process X
							var span = dim.width - offsets.l - offsets.r;
							fill.x = offsets.l + span * fill.x / 100;
							fill.width = span * fill.width / 100;
						}
					}
					break;
			}
			return fill;
		},
		_shapeFill: function(fill, bbox){
			// process shape-specific fill
			if(!fill || !fill.space){
				return fill;
			}
			var space = fill.space;
			switch(fill.type){
				case "linear":
					if(space === "shape" || space === "shapeX" || space === "shapeY"){
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultLinearGradient, fill);
						fill.space = space;
						// process dimensions
						if(space === "shape" || space === "shapeX"){
							// process X
							var span = bbox.width;
							fill.x1 = bbox.x + span * fill.x1 / 100;
							fill.x2 = bbox.x + span * fill.x2 / 100;
						}
						if(space === "shape" || space === "shapeY"){
							// process Y
							var span = bbox.height;
							fill.y1 = bbox.y + span * fill.y1 / 100;
							fill.y2 = bbox.y + span * fill.y2 / 100;
						}
					}
					break;
				case "radial":
					if(space === "shape"){
						// this one is used exclusively for bubble charts and pie charts
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultRadialGradient, fill);
						fill.space = space;
						// process both dimensions
						fill.cx = bbox.x + bbox.width  / 2;
						fill.cy = bbox.y + bbox.height / 2;
						fill.r  = fill.r * bbox.width  / 200;
					}
					break;
				case "pattern":
					if(space === "shape" || space === "shapeX" || space === "shapeY"){
						// clone a fill so we can modify properly directly
						fill = gfx.makeParameters(gfx.defaultPattern, fill);
						fill.space = space;
						// process dimensions
						if(space === "shape" || space === "shapeX"){
							// process X
							var span = bbox.width;
							fill.x = bbox.x + span * fill.x / 100;
							fill.width = span * fill.width / 100;
						}
						if(space === "shape" || space === "shapeY"){
							// process Y
							var span = bbox.height;
							fill.y = bbox.y + span * fill.y / 100;
							fill.height = span * fill.height / 100;
						}
					}
					break;
			}
			return fill;
		},
		_pseudoRadialFill: function(fill, center, radius, start, end){
			// process pseudo-radial fills
			if(!fill || fill.type !== "radial" || fill.space !== "shape"){
				return fill;
			}
			// clone and normalize fill
			var space = fill.space;
			fill = gfx.makeParameters(gfx.defaultRadialGradient, fill);
			fill.space = space;
			if(arguments.length < 4){
				// process both dimensions
				fill.cx = center.x;
				fill.cy = center.y;
				fill.r  = fill.r * radius / 100;
				return fill;
			}
			// convert to a linear gradient
			var angle = arguments.length < 5 ? start : (end + start) / 2;
			return {
				type: "linear",
				x1: center.x,
				y1: center.y,
				x2: center.x + fill.r * radius * Math.cos(angle) / 100,
				y2: center.y + fill.r * radius * Math.sin(angle) / 100,
				colors: fill.colors
			};
			return fill;
		}
	});
});

}}});
(function(){
	// must use this.require to make this work in node.js
	var require = this.require;
	// consume the cached dojo layer
	require({cache:{}});
	!require.async && require(["dojo"]);
	require.boot && require.apply(null, require.boot);
})();
