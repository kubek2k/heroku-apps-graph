const Heroku = require('heroku-client');
const R = require("ramda");
const invertListMap = require("invert-list-map");
const urlParse = require("url-parse");
const isUrl = require("is-url");
const { URL } = require("url");

const heroku = new Heroku({token: process.env.HEROKU_API_TOKEN});

function getAppDomains(app) {
    return heroku.get(`/apps/${app}/domains`)
        .then(domains => domains.map(d => d.hostname));
}

function getAppsDomains(apps) {
    return Promise.all(apps.map(app => Promise.all([app, getAppDomains(app)])))
            .then(domainPairs => invertListMap(R.fromPairs(domainPairs)));
}

function getAppEnvs(app) {
    return heroku.get(`/apps/${app}/config-vars`);
}

function getAppsEnvs(apps) {
    return Promise.all(apps.map(app => Promise.all([app, getAppEnvs(app)])))
            .then(R.fromPairs);
}

function isPlan3URL(url) {
    return url.hostname.match(/.*\.plan3(dev)*\.se$/);
}

function isSQSURL(s) {
    return s.match(/^https:\/\/sqs\.[^\.]*\.amazonaws\.com/);
}

function isSNSARN(s) {
    return s.match(/arn:aws:sns:[^:]*:[^:]*:[^:]*/);
}

function generateKnowsAbout(envs, domains) {
    return R.pipe(
            R.map(v => {
                if (isUrl(v)) {
                    const url = new URL(v);
                    const hostname = url.hostname;
                    const protocol = url.protocol;
                    if (domains[hostname]) {
                        return ["HEROKU", domains[hostname]];
                    } else if (isPlan3URL(url)) {
                        return ["SMP", v];
                    } else if (protocol === "postgres:") {
                        return ["DB", v];
                    } else if (isSQSURL(v)) {
                        return ["SQS", v];
                    } else {
                        return ["EXTERNAL", v];
                    }
                } else if (isSNSARN(v)) {
                    return ["SNS", v]; 
                } else {
                    return null;
                }
            }),
    R.filter(R.complement(R.isNil)))(envs);
}

heroku.get("/organizations/omni/apps")
    .then(apps => apps.map(a => a.name))
    .then(apps => {
        const appsDomains = getAppsDomains(apps);
        const appEnvs = getAppsEnvs(apps);
        return Promise.all([appsDomains, appEnvs]);
    })
    .then(([appDomains, appEnvs]) => {
        console.log(R.map(envs => generateKnowsAbout(envs, appDomains))(appEnvs));
    })
    .catch(err => {
        console.log("Error", err);
    });
