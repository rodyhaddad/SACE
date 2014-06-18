angular.module('sace.app', [])
  .run(function (PortManager) {
    PortManager.start();
  })
  .value('tabId', chrome.devtools.inspectedWindow.tabId)
  .service('PortManager', function (tabId, $rootScope) {
    return {
      port: null,
      start: function () {
        var port = chrome.runtime.connect({name: 'devtools' + tabId});
        port.onMessage.addListener(function (msg) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('sace.devtools.port', msg);
          });
        });
        return port;
      }
    }
  })
  .service('RulesManager', function ($q, tabId) {
    var RulesManager;
    return RulesManager = {
      transformFileRules: function (rules) {
        return Object.keys(rules).map(function (key) {
          return {
            from: key,
            to: rules[key]
          }
        });
      },
      getRules: function () {
        var defer = $q.defer();

        chrome.runtime.sendMessage({
          getRules: {
            tabId: tabId
          }
        }, function (response) {
          console.log('got rules', response)
          defer.resolve(response.rules);
        })

        return defer.promise;
      },
      getRulesFromFiles: function (files) {
        return $q.all(
          Array.prototype.slice.call(files).map(RulesManager.getRulesFromFile)
        ).then(function (rulesFromFiles) {
            var allRules = [];
            angular.forEach(rulesFromFiles, function (rulesFromFile) {
              allRules = allRules.concat(rulesFromFile);
            });
            return allRules;
          });
      },
      getRulesFromFile: function (file) {
        var defer = $q.defer();

        var reader = new FileReader();
        reader.onload = function (evt) {
          var data = RulesManager.transformFileRules(JSON.parse(evt.target.result));
          defer.resolve(data);
        };
        reader.readAsText(file);

        return defer.promise;
      },
      applyRules: function (rules) {
        var defer = $q.defer();

        chrome.runtime.sendMessage({
          applyRules: {
            tabId: tabId,
            rules: JSON.parse(angular.toJson(rules)) // remove $$hashKey
          }
        }, function(response) {
          defer.resolve(response);
        });

        return defer.promise;
      }
    }
  })
  .controller('RulesCtrl', function ($scope, RulesManager) {
    $scope.rules = [];

    RulesManager.getRules().then(function (rules) {
      console.log('setting rules', rules);
      $scope.rules = rules;
    });

    $scope.newRule = {};
    $scope.addNewRule = function () {
      if ($scope.newRuleForm.$valid) {
        $scope.rules.push($scope.newRule);
        $scope.newRule = {};
      }
    }

    $scope.removeRule = function (rule) {
      var indexOf = $scope.rules.indexOf(rule);
      if (indexOf > -1) {
        $scope.rules.splice(indexOf, 1);
        $scope.rulesForm.$setDirty();
      }
    };

    $scope.loadNewFiles = function (files) {
      RulesManager.getRulesFromFiles(files).then(function (rules) {
        $scope.rules = $scope.rules.concat(rules);
        $scope.rulesForm.$setDirty();
      });
    };

    $scope.applyRules = function () {
      $scope.addNewRule();
      RulesManager.applyRules($scope.rules).then(function (response) {
        if (response.success) {
          $scope.rulesForm.$setPristine();
        }
      });
    };

    $scope.$on('sace.devtools.port', function (evt, msg) {
      if ('rules' in msg) {
        console.log('got event', msg.rules);
        $scope.rules = msg.rules;
      }
    });
  })

  .directive('saceFileInput', function () {
    return {
      transclude: true,
      template: '<input type="file" style="display:none" multiple accept=".json" /> <span ng-transclude></span>',
      link: function (scope, el, attrs) {
        el.on('click', function () {
          el.find('input')[0].click();
        });
        el.find('input').on("change", function (evt) {
          scope.$apply(function () {
            scope.$eval(attrs.onFileChoose, {
              files: evt.target.files
            });
          });
        });
      }
    }
  })

  .filter('exportRules', function () {
    return function (rules) {
      if (!rules) return;
      var exportedRules = {};
      rules.forEach(function (rule) {
        exportedRules[rule.from] = rule.to;
      });
      return angular.toJson(exportedRules, true);
    }
  });