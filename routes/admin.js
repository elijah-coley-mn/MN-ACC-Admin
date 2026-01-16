const express = require('express');
var bodyParser = require('body-parser');

const { authRefreshMiddleware, getProjectsACC, getProjectACC, getProjectUsersACC, createProjectACC, importProjectUsersACC, addProjectAdminACC, getUserProfile, addProjectUserACC } = require('../services/aps.js');

let router = express.Router();

router.use(authRefreshMiddleware);

router.get('/api/admin/projects', async function(req, res, next){
    try {
        const projects = await getProjectsACC( req.query.accountId, req.oAuthToken.access_token);
        res.json(projects);
    } catch (err) {
        next(err);
    }
});

router.get('/api/admin/project', async function(req, res, next){
    let projectsList = [];
    try {
        const projectInfo = await getProjectACC( req.query.projectId, req.oAuthToken.access_token);
        projectsList.push(projectInfo);
        res.json(projectsList);
    } catch (err) {
        next(err);
    }
});

router.post('/api/admin/projects', bodyParser.json(), async function (req, res, next) {
    const accountId = req.body.accountId;
    const projects = req.body.data;
    let projectsCreated = [];
    let projectsFailed = [];
    await Promise.all(
        projects.map(async (project) => {
            try{
                let projectInfo = await createProjectACC(accountId, project, req.oAuthToken.access_token);
                projectsCreated.push(projectInfo.name);
                while( projectInfo.status != "active" ){
                    function delay(time) {
                        return new Promise(resolve => setTimeout(resolve, time));
                    }
                    await delay(1000);    
                    projectInfo = await getProjectACC( projectInfo.id, req.oAuthToken.access_token);
                }
                const profile = await getUserProfile(req.oAuthToken);
                await addProjectAdminACC( projectInfo.id, profile.email, req.oAuthToken.access_token )
            }catch(err){
                console.warn("Failed to create project for: "+ project.name + " due to: "+ err.message )
                projectsFailed.push( project.name )
            }
        })
    )
    res.json({'Succeed':projectsCreated, 'Failed': projectsFailed });
});

router.get('/api/admin/project/users', async function (req, res, next) {
    try {
        const users = await getProjectUsersACC(req.query.projectId, req.oAuthToken.access_token);
        res.json(users);
    } catch (err) {
        next(err);
    }
});

router.post('/api/admin/project/users', bodyParser.json(), async function (req, res, next) {
    const projectId = req.body.projectId;
    const users = { 
        'users': req.body.data 
    };
    try {
        const usersRes = await importProjectUsersACC(projectId, users, req.oAuthToken.access_token);
        res.json(usersRes);
    } catch (err) {
        next(err);
    }
});

router.post('/users/:userId/assign-projects', async (req, res, next) => {
    const userId = req.params.userId;
    const { projectIds } = req.body; // Array of project IDs
    
    try {
        const results = await Promise.allSettled(
            projectIds.map(projectId => 
                adminClient.addUserToProject(projectId, userId, req.session)
            )
        );
        
        const summary = {
            successful: results.filter(r => r.status === 'fulfilled').length,
            failed: results.filter(r => r.status === 'rejected').length,
            details: results.map((result, index) => ({
                projectId: projectIds[index],
                status: result.status,
                error: result.status === 'rejected' ? result.reason.message : null
            }))
        };
        
        res.json(summary);
    } catch (err) {
        next(err);
    }
});

router.post('/api/admin/batch-assign', bodyParser.json(), async function (req, res, next) {
    const { accountId, userEmail, companyId, roleIds, products, projectIds, roleId } = req.body;
    
    if (!accountId || !userEmail || !companyId || !projectIds || projectIds.length === 0) {
        return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    // Filter products to only include the four we need
    const allowedProducts = ['docs', 'designCollaboration', 'modelCoordination', 'insight'];
    const filteredProducts = products ? products.filter(p => allowedProducts.includes(p.key)) : [];
    
    // Process in batches with delays to avoid rate limits
    const results = [];
    const batchSize = 10; // Process 10 at a time
    const delayMs = 1000; // 1 second delay between batches
    
    for (let i = 0; i < projectIds.length; i += batchSize) {
        const batch = projectIds.slice(i, i + batchSize);
        
        const batchResults = await Promise.allSettled(
            batch.map(async (projectId) => {
                try {
                    const finalRoleIds = roleId ? [roleId] : roleIds;
                    
                    await addProjectUserACC(projectId, userEmail, companyId, finalRoleIds, filteredProducts, req.oAuthToken.access_token);
                    
                    return { projectId, success: true };
                } catch (err) {
                    throw new Error(err.message);
                }
            })
        );
        
        results.push(...batchResults);
        
        // Delay between batches (except for the last batch)
        if (i + batchSize < projectIds.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    
    const summary = {
        total: projectIds.length,
        successful: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
        details: results.map((result, index) => ({
            projectId: projectIds[index],
            success: result.status === 'fulfilled',
            error: result.status === 'rejected' ? result.reason.message : null
        }))
    };
    
    res.json(summary);
});

module.exports = router;
