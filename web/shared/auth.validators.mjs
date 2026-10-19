/* Generated from auth.schema.json. Do not edit; run npm run contracts:auth:generate. */
import ajvRuntime0 from 'ajv/dist/runtime/ucs2length.js';
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"https://cardford.example/contracts/auth.schema.json","title":"AuthStatusView","description":"Public authentication bootstrap. Provider tokens and identity credentials never enter this contract.","$defs":{"AuthenticatedPlayer":{"type":"object","additionalProperties":false,"required":["id","displayName","plan"],"properties":{"id":{"type":"string","minLength":1,"maxLength":128},"displayName":{"type":"string","maxLength":200},"plan":{"enum":["free","paid"]}}},"SessionLease":{"type":"object","additionalProperties":false,"required":["id","serverTime","accessExpiresAt","idleExpiresAt","absoluteExpiresAt"],"properties":{"id":{"type":"string","minLength":1,"maxLength":256},"serverTime":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"accessExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"idleExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"absoluteExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"}}}},"oneOf":[{"type":"object","additionalProperties":false,"required":["mode","authenticated","loginUrl","logoutUrl","accountUrl","state","refreshUrl"],"properties":{"mode":{"const":"keycloak"},"authenticated":{"const":false},"loginUrl":{"const":"/auth/login"},"logoutUrl":{"const":"/auth/logout"},"accountUrl":{"type":"string","minLength":1,"maxLength":2048},"refreshUrl":{"const":"/auth/refresh"},"state":{"enum":["signed-out","reauthentication-required"]}}},{"type":"object","additionalProperties":false,"required":["mode","authenticated","loginUrl","logoutUrl","accountUrl","csrfToken","state","refreshUrl","session"],"properties":{"mode":{"const":"keycloak"},"authenticated":{"const":false},"loginUrl":{"const":"/auth/login"},"logoutUrl":{"const":"/auth/logout"},"accountUrl":{"type":"string","minLength":1,"maxLength":2048},"csrfToken":{"type":"string","minLength":32,"maxLength":256,"pattern":"^[A-Za-z0-9_-]+$"},"refreshUrl":{"const":"/auth/refresh"},"state":{"const":"renewal-required"},"session":{"$ref":"#/$defs/SessionLease"}}},{"type":"object","additionalProperties":false,"required":["mode","authenticated","loginUrl","logoutUrl","accountUrl","csrfToken","account","state","refreshUrl","session"],"properties":{"mode":{"const":"keycloak"},"authenticated":{"const":true},"loginUrl":{"const":"/auth/login"},"logoutUrl":{"const":"/auth/logout"},"accountUrl":{"type":"string","minLength":1,"maxLength":2048},"csrfToken":{"type":"string","minLength":32,"maxLength":256,"pattern":"^[A-Za-z0-9_-]+$"},"account":{"$ref":"#/$defs/AuthenticatedPlayer"},"refreshUrl":{"const":"/auth/refresh"},"state":{"const":"authenticated"},"session":{"$ref":"#/$defs/SessionLease"}}}]};
const schema32 = {"type":"object","additionalProperties":false,"required":["id","serverTime","accessExpiresAt","idleExpiresAt","absoluteExpiresAt"],"properties":{"id":{"type":"string","minLength":1,"maxLength":256},"serverTime":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"accessExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"idleExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},"absoluteExpiresAt":{"type":"string","minLength":20,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"}}};
const schema33 = {"type":"object","additionalProperties":false,"required":["id","displayName","plan"],"properties":{"id":{"type":"string","minLength":1,"maxLength":128},"displayName":{"type":"string","maxLength":200},"plan":{"enum":["free","paid"]}}};
const func1 = (typeof ajvRuntime0 === 'function' ? ajvRuntime0 : ajvRuntime0.default);
const func3 = Object.prototype.hasOwnProperty;
const pattern4 = new RegExp("^[A-Za-z0-9_-]+$", "u");
const pattern5 = new RegExp("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$", "u");

function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="https://cardford.example/contracts/auth.schema.json" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.mode === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.authenticated === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "authenticated"},message:"must have required property '"+"authenticated"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.loginUrl === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "loginUrl"},message:"must have required property '"+"loginUrl"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.logoutUrl === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "logoutUrl"},message:"must have required property '"+"logoutUrl"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.accountUrl === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "accountUrl"},message:"must have required property '"+"accountUrl"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.state === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.refreshUrl === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "refreshUrl"},message:"must have required property '"+"refreshUrl"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "mode") || (key0 === "authenticated")) || (key0 === "loginUrl")) || (key0 === "logoutUrl")) || (key0 === "accountUrl")) || (key0 === "refreshUrl")) || (key0 === "state"))){
const err7 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.mode !== undefined){
if("keycloak" !== data.mode){
const err8 = {instancePath:instancePath+"/mode",schemaPath:"#/oneOf/0/properties/mode/const",keyword:"const",params:{allowedValue: "keycloak"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.authenticated !== undefined){
if(false !== data.authenticated){
const err9 = {instancePath:instancePath+"/authenticated",schemaPath:"#/oneOf/0/properties/authenticated/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.loginUrl !== undefined){
if("/auth/login" !== data.loginUrl){
const err10 = {instancePath:instancePath+"/loginUrl",schemaPath:"#/oneOf/0/properties/loginUrl/const",keyword:"const",params:{allowedValue: "/auth/login"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.logoutUrl !== undefined){
if("/auth/logout" !== data.logoutUrl){
const err11 = {instancePath:instancePath+"/logoutUrl",schemaPath:"#/oneOf/0/properties/logoutUrl/const",keyword:"const",params:{allowedValue: "/auth/logout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.accountUrl !== undefined){
let data4 = data.accountUrl;
if(typeof data4 === "string"){
if(func1(data4) > 2048){
const err12 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/0/properties/accountUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func1(data4) < 1){
const err13 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/0/properties/accountUrl/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
else {
const err14 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/0/properties/accountUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.refreshUrl !== undefined){
if("/auth/refresh" !== data.refreshUrl){
const err15 = {instancePath:instancePath+"/refreshUrl",schemaPath:"#/oneOf/0/properties/refreshUrl/const",keyword:"const",params:{allowedValue: "/auth/refresh"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.state !== undefined){
let data6 = data.state;
if(!((data6 === "signed-out") || (data6 === "reauthentication-required"))){
const err16 = {instancePath:instancePath+"/state",schemaPath:"#/oneOf/0/properties/state/enum",keyword:"enum",params:{allowedValues: schema31.oneOf[0].properties.state.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs12 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.mode === undefined){
const err18 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.authenticated === undefined){
const err19 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "authenticated"},message:"must have required property '"+"authenticated"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.loginUrl === undefined){
const err20 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "loginUrl"},message:"must have required property '"+"loginUrl"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.logoutUrl === undefined){
const err21 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "logoutUrl"},message:"must have required property '"+"logoutUrl"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.accountUrl === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "accountUrl"},message:"must have required property '"+"accountUrl"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.csrfToken === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "csrfToken"},message:"must have required property '"+"csrfToken"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.state === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.refreshUrl === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "refreshUrl"},message:"must have required property '"+"refreshUrl"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.session === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "session"},message:"must have required property '"+"session"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key1 in data){
if(!(func3.call(schema31.oneOf[1].properties, key1))){
const err27 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.mode !== undefined){
if("keycloak" !== data.mode){
const err28 = {instancePath:instancePath+"/mode",schemaPath:"#/oneOf/1/properties/mode/const",keyword:"const",params:{allowedValue: "keycloak"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.authenticated !== undefined){
if(false !== data.authenticated){
const err29 = {instancePath:instancePath+"/authenticated",schemaPath:"#/oneOf/1/properties/authenticated/const",keyword:"const",params:{allowedValue: false},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.loginUrl !== undefined){
if("/auth/login" !== data.loginUrl){
const err30 = {instancePath:instancePath+"/loginUrl",schemaPath:"#/oneOf/1/properties/loginUrl/const",keyword:"const",params:{allowedValue: "/auth/login"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.logoutUrl !== undefined){
if("/auth/logout" !== data.logoutUrl){
const err31 = {instancePath:instancePath+"/logoutUrl",schemaPath:"#/oneOf/1/properties/logoutUrl/const",keyword:"const",params:{allowedValue: "/auth/logout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.accountUrl !== undefined){
let data11 = data.accountUrl;
if(typeof data11 === "string"){
if(func1(data11) > 2048){
const err32 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/1/properties/accountUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(func1(data11) < 1){
const err33 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/1/properties/accountUrl/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
else {
const err34 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/1/properties/accountUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.csrfToken !== undefined){
let data12 = data.csrfToken;
if(typeof data12 === "string"){
if(func1(data12) > 256){
const err35 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/1/properties/csrfToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(func1(data12) < 32){
const err36 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/1/properties/csrfToken/minLength",keyword:"minLength",params:{limit: 32},message:"must NOT have fewer than 32 characters"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(!pattern4.test(data12)){
const err37 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/1/properties/csrfToken/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]+$"},message:"must match pattern \""+"^[A-Za-z0-9_-]+$"+"\""};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
else {
const err38 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/1/properties/csrfToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.refreshUrl !== undefined){
if("/auth/refresh" !== data.refreshUrl){
const err39 = {instancePath:instancePath+"/refreshUrl",schemaPath:"#/oneOf/1/properties/refreshUrl/const",keyword:"const",params:{allowedValue: "/auth/refresh"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.state !== undefined){
if("renewal-required" !== data.state){
const err40 = {instancePath:instancePath+"/state",schemaPath:"#/oneOf/1/properties/state/const",keyword:"const",params:{allowedValue: "renewal-required"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data.session !== undefined){
let data15 = data.session;
if(data15 && typeof data15 == "object" && !Array.isArray(data15)){
if(data15.id === undefined){
const err41 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data15.serverTime === undefined){
const err42 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "serverTime"},message:"must have required property '"+"serverTime"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data15.accessExpiresAt === undefined){
const err43 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "accessExpiresAt"},message:"must have required property '"+"accessExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data15.idleExpiresAt === undefined){
const err44 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "idleExpiresAt"},message:"must have required property '"+"idleExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data15.absoluteExpiresAt === undefined){
const err45 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "absoluteExpiresAt"},message:"must have required property '"+"absoluteExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key2 in data15){
if(!(((((key2 === "id") || (key2 === "serverTime")) || (key2 === "accessExpiresAt")) || (key2 === "idleExpiresAt")) || (key2 === "absoluteExpiresAt"))){
const err46 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data15.id !== undefined){
let data16 = data15.id;
if(typeof data16 === "string"){
if(func1(data16) > 256){
const err47 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(func1(data16) < 1){
const err48 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
else {
const err49 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data15.serverTime !== undefined){
let data17 = data15.serverTime;
if(typeof data17 === "string"){
if(func1(data17) > 64){
const err50 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(func1(data17) < 20){
const err51 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(!pattern5.test(data17)){
const err52 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
}
else {
const err53 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data15.accessExpiresAt !== undefined){
let data18 = data15.accessExpiresAt;
if(typeof data18 === "string"){
if(func1(data18) > 64){
const err54 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(func1(data18) < 20){
const err55 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(!pattern5.test(data18)){
const err56 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
else {
const err57 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data15.idleExpiresAt !== undefined){
let data19 = data15.idleExpiresAt;
if(typeof data19 === "string"){
if(func1(data19) > 64){
const err58 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(func1(data19) < 20){
const err59 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(!pattern5.test(data19)){
const err60 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
else {
const err61 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data15.absoluteExpiresAt !== undefined){
let data20 = data15.absoluteExpiresAt;
if(typeof data20 === "string"){
if(func1(data20) > 64){
const err62 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(func1(data20) < 20){
const err63 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
if(!pattern5.test(data20)){
const err64 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
else {
const err65 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
}
else {
const err66 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
}
else {
const err67 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
var _valid0 = _errs12 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs39 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.mode === undefined){
const err68 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
if(data.authenticated === undefined){
const err69 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "authenticated"},message:"must have required property '"+"authenticated"+"'"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(data.loginUrl === undefined){
const err70 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "loginUrl"},message:"must have required property '"+"loginUrl"+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(data.logoutUrl === undefined){
const err71 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "logoutUrl"},message:"must have required property '"+"logoutUrl"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data.accountUrl === undefined){
const err72 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "accountUrl"},message:"must have required property '"+"accountUrl"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
if(data.csrfToken === undefined){
const err73 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "csrfToken"},message:"must have required property '"+"csrfToken"+"'"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
if(data.account === undefined){
const err74 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "account"},message:"must have required property '"+"account"+"'"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(data.state === undefined){
const err75 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "state"},message:"must have required property '"+"state"+"'"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if(data.refreshUrl === undefined){
const err76 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "refreshUrl"},message:"must have required property '"+"refreshUrl"+"'"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
if(data.session === undefined){
const err77 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "session"},message:"must have required property '"+"session"+"'"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
for(const key3 in data){
if(!(func3.call(schema31.oneOf[2].properties, key3))){
const err78 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.mode !== undefined){
if("keycloak" !== data.mode){
const err79 = {instancePath:instancePath+"/mode",schemaPath:"#/oneOf/2/properties/mode/const",keyword:"const",params:{allowedValue: "keycloak"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data.authenticated !== undefined){
if(true !== data.authenticated){
const err80 = {instancePath:instancePath+"/authenticated",schemaPath:"#/oneOf/2/properties/authenticated/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
if(data.loginUrl !== undefined){
if("/auth/login" !== data.loginUrl){
const err81 = {instancePath:instancePath+"/loginUrl",schemaPath:"#/oneOf/2/properties/loginUrl/const",keyword:"const",params:{allowedValue: "/auth/login"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
if(data.logoutUrl !== undefined){
if("/auth/logout" !== data.logoutUrl){
const err82 = {instancePath:instancePath+"/logoutUrl",schemaPath:"#/oneOf/2/properties/logoutUrl/const",keyword:"const",params:{allowedValue: "/auth/logout"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
if(data.accountUrl !== undefined){
let data25 = data.accountUrl;
if(typeof data25 === "string"){
if(func1(data25) > 2048){
const err83 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/2/properties/accountUrl/maxLength",keyword:"maxLength",params:{limit: 2048},message:"must NOT have more than 2048 characters"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
if(func1(data25) < 1){
const err84 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/2/properties/accountUrl/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
else {
const err85 = {instancePath:instancePath+"/accountUrl",schemaPath:"#/oneOf/2/properties/accountUrl/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
if(data.csrfToken !== undefined){
let data26 = data.csrfToken;
if(typeof data26 === "string"){
if(func1(data26) > 256){
const err86 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/2/properties/csrfToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
if(func1(data26) < 32){
const err87 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/2/properties/csrfToken/minLength",keyword:"minLength",params:{limit: 32},message:"must NOT have fewer than 32 characters"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
if(!pattern4.test(data26)){
const err88 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/2/properties/csrfToken/pattern",keyword:"pattern",params:{pattern: "^[A-Za-z0-9_-]+$"},message:"must match pattern \""+"^[A-Za-z0-9_-]+$"+"\""};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
}
}
else {
const err89 = {instancePath:instancePath+"/csrfToken",schemaPath:"#/oneOf/2/properties/csrfToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data.account !== undefined){
let data27 = data.account;
if(data27 && typeof data27 == "object" && !Array.isArray(data27)){
if(data27.id === undefined){
const err90 = {instancePath:instancePath+"/account",schemaPath:"#/$defs/AuthenticatedPlayer/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
if(data27.displayName === undefined){
const err91 = {instancePath:instancePath+"/account",schemaPath:"#/$defs/AuthenticatedPlayer/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
if(data27.plan === undefined){
const err92 = {instancePath:instancePath+"/account",schemaPath:"#/$defs/AuthenticatedPlayer/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
for(const key4 in data27){
if(!(((key4 === "id") || (key4 === "displayName")) || (key4 === "plan"))){
const err93 = {instancePath:instancePath+"/account",schemaPath:"#/$defs/AuthenticatedPlayer/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
}
if(data27.id !== undefined){
let data28 = data27.id;
if(typeof data28 === "string"){
if(func1(data28) > 128){
const err94 = {instancePath:instancePath+"/account/id",schemaPath:"#/$defs/AuthenticatedPlayer/properties/id/maxLength",keyword:"maxLength",params:{limit: 128},message:"must NOT have more than 128 characters"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
if(func1(data28) < 1){
const err95 = {instancePath:instancePath+"/account/id",schemaPath:"#/$defs/AuthenticatedPlayer/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
}
else {
const err96 = {instancePath:instancePath+"/account/id",schemaPath:"#/$defs/AuthenticatedPlayer/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
if(data27.displayName !== undefined){
let data29 = data27.displayName;
if(typeof data29 === "string"){
if(func1(data29) > 200){
const err97 = {instancePath:instancePath+"/account/displayName",schemaPath:"#/$defs/AuthenticatedPlayer/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 200},message:"must NOT have more than 200 characters"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
}
else {
const err98 = {instancePath:instancePath+"/account/displayName",schemaPath:"#/$defs/AuthenticatedPlayer/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err98];
}
else {
vErrors.push(err98);
}
errors++;
}
}
if(data27.plan !== undefined){
let data30 = data27.plan;
if(!((data30 === "free") || (data30 === "paid"))){
const err99 = {instancePath:instancePath+"/account/plan",schemaPath:"#/$defs/AuthenticatedPlayer/properties/plan/enum",keyword:"enum",params:{allowedValues: schema33.properties.plan.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err99];
}
else {
vErrors.push(err99);
}
errors++;
}
}
}
else {
const err100 = {instancePath:instancePath+"/account",schemaPath:"#/$defs/AuthenticatedPlayer/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err100];
}
else {
vErrors.push(err100);
}
errors++;
}
}
if(data.refreshUrl !== undefined){
if("/auth/refresh" !== data.refreshUrl){
const err101 = {instancePath:instancePath+"/refreshUrl",schemaPath:"#/oneOf/2/properties/refreshUrl/const",keyword:"const",params:{allowedValue: "/auth/refresh"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err101];
}
else {
vErrors.push(err101);
}
errors++;
}
}
if(data.state !== undefined){
if("authenticated" !== data.state){
const err102 = {instancePath:instancePath+"/state",schemaPath:"#/oneOf/2/properties/state/const",keyword:"const",params:{allowedValue: "authenticated"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err102];
}
else {
vErrors.push(err102);
}
errors++;
}
}
if(data.session !== undefined){
let data33 = data.session;
if(data33 && typeof data33 == "object" && !Array.isArray(data33)){
if(data33.id === undefined){
const err103 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err103];
}
else {
vErrors.push(err103);
}
errors++;
}
if(data33.serverTime === undefined){
const err104 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "serverTime"},message:"must have required property '"+"serverTime"+"'"};
if(vErrors === null){
vErrors = [err104];
}
else {
vErrors.push(err104);
}
errors++;
}
if(data33.accessExpiresAt === undefined){
const err105 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "accessExpiresAt"},message:"must have required property '"+"accessExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err105];
}
else {
vErrors.push(err105);
}
errors++;
}
if(data33.idleExpiresAt === undefined){
const err106 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "idleExpiresAt"},message:"must have required property '"+"idleExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err106];
}
else {
vErrors.push(err106);
}
errors++;
}
if(data33.absoluteExpiresAt === undefined){
const err107 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/required",keyword:"required",params:{missingProperty: "absoluteExpiresAt"},message:"must have required property '"+"absoluteExpiresAt"+"'"};
if(vErrors === null){
vErrors = [err107];
}
else {
vErrors.push(err107);
}
errors++;
}
for(const key5 in data33){
if(!(((((key5 === "id") || (key5 === "serverTime")) || (key5 === "accessExpiresAt")) || (key5 === "idleExpiresAt")) || (key5 === "absoluteExpiresAt"))){
const err108 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err108];
}
else {
vErrors.push(err108);
}
errors++;
}
}
if(data33.id !== undefined){
let data34 = data33.id;
if(typeof data34 === "string"){
if(func1(data34) > 256){
const err109 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err109];
}
else {
vErrors.push(err109);
}
errors++;
}
if(func1(data34) < 1){
const err110 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err110];
}
else {
vErrors.push(err110);
}
errors++;
}
}
else {
const err111 = {instancePath:instancePath+"/session/id",schemaPath:"#/$defs/SessionLease/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err111];
}
else {
vErrors.push(err111);
}
errors++;
}
}
if(data33.serverTime !== undefined){
let data35 = data33.serverTime;
if(typeof data35 === "string"){
if(func1(data35) > 64){
const err112 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err112];
}
else {
vErrors.push(err112);
}
errors++;
}
if(func1(data35) < 20){
const err113 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err113];
}
else {
vErrors.push(err113);
}
errors++;
}
if(!pattern5.test(data35)){
const err114 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err114];
}
else {
vErrors.push(err114);
}
errors++;
}
}
else {
const err115 = {instancePath:instancePath+"/session/serverTime",schemaPath:"#/$defs/SessionLease/properties/serverTime/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err115];
}
else {
vErrors.push(err115);
}
errors++;
}
}
if(data33.accessExpiresAt !== undefined){
let data36 = data33.accessExpiresAt;
if(typeof data36 === "string"){
if(func1(data36) > 64){
const err116 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err116];
}
else {
vErrors.push(err116);
}
errors++;
}
if(func1(data36) < 20){
const err117 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err117];
}
else {
vErrors.push(err117);
}
errors++;
}
if(!pattern5.test(data36)){
const err118 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err118];
}
else {
vErrors.push(err118);
}
errors++;
}
}
else {
const err119 = {instancePath:instancePath+"/session/accessExpiresAt",schemaPath:"#/$defs/SessionLease/properties/accessExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err119];
}
else {
vErrors.push(err119);
}
errors++;
}
}
if(data33.idleExpiresAt !== undefined){
let data37 = data33.idleExpiresAt;
if(typeof data37 === "string"){
if(func1(data37) > 64){
const err120 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err120];
}
else {
vErrors.push(err120);
}
errors++;
}
if(func1(data37) < 20){
const err121 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err121];
}
else {
vErrors.push(err121);
}
errors++;
}
if(!pattern5.test(data37)){
const err122 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err122];
}
else {
vErrors.push(err122);
}
errors++;
}
}
else {
const err123 = {instancePath:instancePath+"/session/idleExpiresAt",schemaPath:"#/$defs/SessionLease/properties/idleExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err123];
}
else {
vErrors.push(err123);
}
errors++;
}
}
if(data33.absoluteExpiresAt !== undefined){
let data38 = data33.absoluteExpiresAt;
if(typeof data38 === "string"){
if(func1(data38) > 64){
const err124 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"};
if(vErrors === null){
vErrors = [err124];
}
else {
vErrors.push(err124);
}
errors++;
}
if(func1(data38) < 20){
const err125 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"};
if(vErrors === null){
vErrors = [err125];
}
else {
vErrors.push(err125);
}
errors++;
}
if(!pattern5.test(data38)){
const err126 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$"+"\""};
if(vErrors === null){
vErrors = [err126];
}
else {
vErrors.push(err126);
}
errors++;
}
}
else {
const err127 = {instancePath:instancePath+"/session/absoluteExpiresAt",schemaPath:"#/$defs/SessionLease/properties/absoluteExpiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err127];
}
else {
vErrors.push(err127);
}
errors++;
}
}
}
else {
const err128 = {instancePath:instancePath+"/session",schemaPath:"#/$defs/SessionLease/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err128];
}
else {
vErrors.push(err128);
}
errors++;
}
}
}
else {
const err129 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err129];
}
else {
vErrors.push(err129);
}
errors++;
}
var _valid0 = _errs39 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err130 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err130];
}
else {
vErrors.push(err130);
}
errors++;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate20.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate20.evaluated = {"dynamicProps":true,"dynamicItems":false};
