const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/usermodel');
const crypto = require('crypto');
const async = require('async');
const nodemailer = require('nodemailer');


// check user authentication
function isAuthenticatedUser(req,res,next) {
    if(req.isAuthenticated()) {
        return next();
    }
    req.flash('error_msg', 'please login first to access this page');
    res.redirect('/login');
}

router.get('/login',(req,res)=>{
    res.render('./users/login');
});

router.get('/signup',isAuthenticatedUser,(req,res)=>{
    res.render('./users/signup');
});



router.get('/logout',isAuthenticatedUser,(req,res)=>{
    req.logOut();
    req.flash('success_msg', 'You have been logged out');
    res.redirect('/login');
});
router.get('/forgot',(req,res)=>{
    res.render('./users/forgot');
});

router.get('/reset/:token', (req, res)=> {
    User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires : {$gt : Date.now() } })
        .then(user => {
            if(!user) {
                req.flash('error_msg', 'Password reset token in invalid or has been expired.');
                res.redirect('/forgot');
            }

            res.render('./users/newpassword', {token : req.params.token});
        })
        .catch(err => {
            req.flash('error_msg', 'ERROR: '+err);
            res.redirect('/forgot');
        });
});

router.get('/password/change',isAuthenticatedUser, (req,res)=>{
    res.render('./users/changepassword');
});

router.get('/users/all',isAuthenticatedUser,(req,res)=>{
    User.find({})
        .then(users =>{
            res.render('./users/alluser',{users :users});
        })
        .catch(err =>{
            console.log(err);
        })
});

router.get('/edit/:id',isAuthenticatedUser,(req,res)=>{
    let searchQuery = {_id : req.params.id};

    User.findOne(searchQuery)
    .then(user =>{
        res.render('./users/edituser',{user: user});
    })
        .catch(err =>{
            req.flash('error_msg','ERROR:' +err);
            res.redirect('/users/all');
    });
});



router.post('/login', passport.authenticate('local',{
    successRedirect : '/dashboard',
    failureRedirect : '/login',
    failureFlash : 'Invalid email or password. Try Again !!'
}));

router.post('/signup',isAuthenticatedUser,(req,res)=> {
    let {name,email,password} = req.body;

    let userData = {
        name : name,
        email : email
    };
    User.register(userData, password, (err, user)=>{
        if(err) {
            req.flash('error_msg','ERROR:'+err);
            res.redirect('/signup');
        }
        
            req.flash('success_msg','Account created successfully');
            res.redirect('/signup');

        });
    });

router.post('/password/change',(req,res)=>{
    if(req.body.password !== req.body.confirmpassword) {
        req.flash('error_msg', "Password don't match. try again !");
        res.redirect('/password/change');
    }
    User.findOne({email : req.user.email})
    .then(user => {
        user.setPassword(req.body.password, err=>{
            user.save()
                .then(user => {
                    req.flash('success_msg', 'Password changed successfully.');
                    res.redirect('/password/change');
                })
                .catch(err => {
                    req.flash('error_msg', 'ERROR: '+err);
                    res.redirect('/password/change');
                });
        });
    });
});

//routes to handle forgot password
router.post('/forgot',(req,res,next)=>{
    let recoveryPassword = '';
    async.waterfall([
        (done) =>{
            crypto.randomBytes(20, (err, buf) =>{
                let token = buf.toString('hex');
                done(err, token);
            });
    },
            (token, done) => {
                User.findOne({email : req.body.email})
                    .then(user => {
                        if(!user) {
                            req.flash('error_msg', 'User does not exist with this email');
                            return res.redirect('/forgot');
                        }

                        user.resetPasswordToken = token;
                        user.resetPasswordExpires = Date.now() + 1800000;     // 1/2 hours

                        user.save(err => {
                            done(err, token, user);
                        });

                    })
                    .catch(err => {
                        req.flash('error_msg','ERROR: ' +err);
                        res.redirect('/forgot');
                    })
            },
            (token, user) => {
                let smtpTransport = nodemailer.createTransport({
                    service: 'Gmail',
                    auth: {
                        user : process.env.GMAIL_EMAIL,
                        pass: process.env.GMAIL_PASSWORD    
                    }
                });
                let mailOptions = {
                    to : user.email,
                    from : 'sid siddharthchaudharyjaat007@gmail.com',
                    subject : 'Recovery Email from Auth Project',
                    text : 'Please click the following link to recover your password: \n\n' +
                        'http://' +req.headers.host +'/reset/'+token+'\n\n'+
                        'If you did not request this, please ignore this email.'
                };
                smtpTransport.sendMail(mailOptions, err=> {
                    req.flash('success_msg', 'Email send with further instructions. please check email');
                    res.redirect('/forgot');
                });
            }

        

    ], err => {
        if(err) res.redirect('/forgot');
    
    });
});

router.post('/reset/:token' , (req,res)=>{
    async.waterfall([
        (done) => {
            User.findOne({resetPasswordToken: req.params.token, resetPasswordExpires : {$gt : Date.now() } })
                .then(user => {
                    if(!user) {
                        req.flash('error_msg', 'Password reset token in invalid or has been expired.');
                        res.redirect('/forgot');
                    }
                    if(req.body.password !== req.body.confirmpassword) {
                        req.flash('error_msg', "password don't match");
                        return res.redirect('/forgot');
                    }
                    user.setPassword(req.body.password, err =>{
                        user.resetPasswordToken = undefined;
                        user.resetPasswordExpires = undefined;

                        user.save(err =>{
                            req.logIn(user,err =>{
                                done(err, user);
                            })
                        });
                    });
                })
                .catch(err =>{
                    req.flash('error_msg', 'ERROR:' +err);
                    res.redirect('/forgot');
                });
            },
            (user) => {
                let smtpTransport = nodemailer.createTransport({
                    service : 'Gmail',
                    auth :{
                        user : process.env.GMAIL_EMAIL,
                        pass : process.env.GMAIL_PASSWORD
                    }
                });
                let mailOptions = {
                    to : user.email,
                    from : 'sid siddharthchaudharyjaat007@gmail.com',
                    subject : 'Your password is changed',
                    text : 'Hello, '+user.name+'\n\n'+
                        'This is confirmation that password for your account '+user.email+' has been changed'
                };

                smtpTransport.sendMail(mailOptions, err =>{
                    req.flash('success_msg', 'YOur password has been changed successfully');
                    res.redirect('/login');
                });
            }

    ], err => {
        res.redirect('/login');
    
    });
});

router.put('/edit/:id',(req,res)=>{
    let searchQuery = { _id : req.params.id};

    User.updateOne(searchQuery, {$set : {
        name : req.body.name,
        email : req.body.email
    }})
    .then(user =>{
        req.flash('success_msg','User updated successfully');
        res.redirect('/users/all');
    })
    .catch(err => {
        req.flash('error_msg','ERROR:' +err);
        res.redirect('/users/all');
    })
});

router.delete('/delete/user/:id', (req,res)=>{
    let searchQuery = {_id : req.params.id}

    User.deleteOne(searchQuery)
    .then(user =>{
        req.flash('success_msg','User deleted successfully');
        res.redirect('/users/all');
    })
    .catch(err => {
        req.flash('error_msg','ERROR:' +err);
        res.redirect('/users/all');
    })
});


module.exports = router;