/* Generated from contracts.schema.json. Do not edit; run npm run contracts:generate. */
import ajvRuntime0 from 'ajv/dist/runtime/equal.js';
import ajvRuntime1 from 'ajv/dist/runtime/ucs2length.js';
"use strict";
export const validateMode = validate109;
const schema32 = {"title":"Mode","enum":["hearts","spades-solo","spades-partners"]};

function validate109(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate109.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(((data === "hearts") || (data === "spades-solo")) || (data === "spades-partners"))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate109.errors = vErrors;
return errors === 0;
}
validate109.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validateSeat = validate110;
const schema33 = {"title":"Seat","enum":[0,1,2,3]};

function validate110(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate110.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!((((data === 0) || (data === 1)) || (data === 2)) || (data === 3))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate110.errors = vErrors;
return errors === 0;
}
validate110.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validateCard = validate111;
const schema34 = {"title":"Card","type":"string","pattern":"^[CDHS](?:[2-9]|10|J|Q|K|A)$"};
const pattern4 = new RegExp("^[CDHS](?:[2-9]|10|J|Q|K|A)$", "u");

function validate111(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate111.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(typeof data === "string"){
if(!pattern4.test(data)){
const err0 = {instancePath,schemaPath:"#/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
else {
const err1 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
validate111.errors = vErrors;
return errors === 0;
}
validate111.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validateSuit = validate112;
const schema35 = {"title":"Suit","enum":["C","D","H","S"]};

function validate112(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate112.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!((((data === "C") || (data === "D")) || (data === "H")) || (data === "S"))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema35.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate112.errors = vErrors;
return errors === 0;
}
validate112.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validatePhase = validate113;
const schema36 = {"title":"Phase","enum":["pass","bid","play","trick-end","hand-end","match-end"]};

function validate113(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate113.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!((((((data === "pass") || (data === "bid")) || (data === "play")) || (data === "trick-end")) || (data === "hand-end")) || (data === "match-end"))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema36.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate113.errors = vErrors;
return errors === 0;
}
validate113.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validateGameAction = validate114;
const schema37 = {"title":"GameAction","oneOf":[{"type":"object","properties":{"kind":{"const":"bid"},"bid":{"type":"integer","minimum":0,"maximum":13}},"required":["kind","bid"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"play"},"card":{"$ref":"#/$defs/Card"}},"required":["kind","card"],"additionalProperties":false},{"type":"object","properties":{"kind":{"const":"pass"},"cards":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3,"minItems":3,"uniqueItems":true}},"required":["kind","cards"],"additionalProperties":false}]};
const func0 = (typeof ajvRuntime0 === 'function' ? ajvRuntime0 : ajvRuntime0.default);

function validate114(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate114.evaluated;
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
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bid === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "bid"},message:"must have required property '"+"bid"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "bid"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("bid" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "bid"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.bid !== undefined){
let data1 = data.bid;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err4 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 13 || isNaN(data1)){
const err5 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1 < 0 || isNaN(data1)){
const err6 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.card === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "card"},message:"must have required property '"+"card"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "card"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
if("play" !== data.kind){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "play"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.card !== undefined){
let data3 = data.card;
if(typeof data3 === "string"){
if(!pattern4.test(data3)){
const err12 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs7 === errors;
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
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.cards === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "cards"},message:"must have required property '"+"cards"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key2 in data){
if(!((key2 === "kind") || (key2 === "cards"))){
const err17 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined){
if("pass" !== data.kind){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "pass"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.cards !== undefined){
let data5 = data.cards;
if(Array.isArray(data5)){
if(data5.length > 3){
const err19 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data5.length < 3){
const err20 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err21 = {instancePath:instancePath+"/cards/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/cards/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data5[i1], data5[j0])){
const err23 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err24 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid0 = _errs14 === errors;
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
const err26 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
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
validate114.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate114.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validatePlay = validate115;
const schema40 = {"title":"Play","type":"object","properties":{"seat":{"$ref":"#/$defs/Seat"},"card":{"$ref":"#/$defs/Card"}},"required":["seat","card"],"additionalProperties":false};

function validate115(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate115.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.seat === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "seat"},message:"must have required property '"+"seat"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.card === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "card"},message:"must have required property '"+"card"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "seat") || (key0 === "card"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.seat !== undefined){
let data0 = data.seat;
if(!((((data0 === 0) || (data0 === 1)) || (data0 === 2)) || (data0 === 3))){
const err3 = {instancePath:instancePath+"/seat",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.card !== undefined){
let data1 = data.card;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err4 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate115.errors = vErrors;
return errors === 0;
}
validate115.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTrick = validate116;
const schema43 = {"title":"Trick","type":"object","properties":{"plays":{"type":"array","items":{"$ref":"#/$defs/Play"},"maxItems":4,"minItems":4},"winner":{"$ref":"#/$defs/Seat"}},"required":["plays","winner"],"additionalProperties":false};

function validate23(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate23.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.seat === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "seat"},message:"must have required property '"+"seat"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.card === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "card"},message:"must have required property '"+"card"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "seat") || (key0 === "card"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.seat !== undefined){
let data0 = data.seat;
if(!((((data0 === 0) || (data0 === 1)) || (data0 === 2)) || (data0 === 3))){
const err3 = {instancePath:instancePath+"/seat",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.card !== undefined){
let data1 = data.card;
if(typeof data1 === "string"){
if(!pattern4.test(data1)){
const err4 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate23.errors = vErrors;
return errors === 0;
}
validate23.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate116(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate116.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.plays === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plays"},message:"must have required property '"+"plays"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.winner === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "winner"},message:"must have required property '"+"winner"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "plays") || (key0 === "winner"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.plays !== undefined){
let data0 = data.plays;
if(Array.isArray(data0)){
if(data0.length > 4){
const err3 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 4){
const err4 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
if(!(validate23(data0[i0], {instancePath:instancePath+"/plays/" + i0,parentData:data0,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.winner !== undefined){
let data2 = data.winner;
if(!((((data2 === 0) || (data2 === 1)) || (data2 === 2)) || (data2 === 3))){
const err6 = {instancePath:instancePath+"/winner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate116.errors = vErrors;
return errors === 0;
}
validate116.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateHandResult = validate118;
const schema45 = {"title":"HandResult","type":"object","properties":{"points":{"type":"array","items":{"type":"integer"},"maxItems":4,"minItems":4},"bags":{"type":"array","items":{"type":"integer","minimum":0},"maxItems":4,"minItems":4},"winner":{"$ref":"#/$defs/Seat"}},"required":["points","bags"],"additionalProperties":false};

function validate118(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate118.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.points === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bags === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bags"},message:"must have required property '"+"bags"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "points") || (key0 === "bags")) || (key0 === "winner"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.points !== undefined){
let data0 = data.points;
if(Array.isArray(data0)){
if(data0.length > 4){
const err3 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 4){
const err4 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/points/" + i0,schemaPath:"#/properties/points/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.bags !== undefined){
let data2 = data.bags;
if(Array.isArray(data2)){
if(data2.length > 4){
const err7 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2.length < 4){
const err8 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
const len1 = data2.length;
for(let i1=0; i1<len1; i1++){
let data3 = data2[i1];
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err9 = {instancePath:instancePath+"/bags/" + i1,schemaPath:"#/properties/bags/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 0 || isNaN(data3)){
const err10 = {instancePath:instancePath+"/bags/" + i1,schemaPath:"#/properties/bags/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
else {
const err11 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.winner !== undefined){
let data4 = data.winner;
if(!((((data4 === 0) || (data4 === 1)) || (data4 === 2)) || (data4 === 3))){
const err12 = {instancePath:instancePath+"/winner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate118.errors = vErrors;
return errors === 0;
}
validate118.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateGameView = validate119;
const schema47 = {"title":"GameView","type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":256},"mode":{"$ref":"#/$defs/Mode"},"phase":{"$ref":"#/$defs/Phase"},"hand":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":13,"uniqueItems":true},"handCounts":{"type":"array","items":{"type":"integer","minimum":0,"maximum":13},"maxItems":4,"minItems":4},"bids":{"type":"array","items":{"anyOf":[{"type":"integer","minimum":0,"maximum":13},{"type":"null"}]},"maxItems":4,"minItems":4},"tricks":{"type":"array","items":{"type":"integer","minimum":0,"maximum":13},"maxItems":4,"minItems":4},"scores":{"type":"array","items":{"type":"integer"},"maxItems":4,"minItems":4},"bags":{"type":"array","items":{"type":"integer","minimum":0},"maxItems":4,"minItems":4},"trick":{"type":"array","items":{"$ref":"#/$defs/Play"},"maxItems":4},"history":{"type":"array","items":{"$ref":"#/$defs/Trick"},"maxItems":13},"turn":{"anyOf":[{"$ref":"#/$defs/Seat"},{"type":"null"}]},"dealer":{"$ref":"#/$defs/Seat"},"handNumber":{"type":"integer","minimum":1},"heartsBroken":{"type":"boolean"},"spadesBroken":{"type":"boolean"},"passDirection":{"enum":["left","right","across","hold"]},"received":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3,"uniqueItems":true},"outgoing":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3,"uniqueItems":true},"handResult":{"anyOf":[{"$ref":"#/$defs/HandResult"},{"type":"null"}]},"currentWinner":{"anyOf":[{"$ref":"#/$defs/Seat"},{"type":"null"}]},"legalActions":{"type":"array","items":{"$ref":"#/$defs/GameAction"},"maxItems":286}},"required":["id","mode","phase","hand","handCounts","bids","tricks","scores","bags","trick","history","turn","dealer","handNumber","heartsBroken","spadesBroken","passDirection","received","outgoing","handResult","currentWinner","legalActions"],"additionalProperties":false,"if":{"properties":{"phase":{"const":"pass"}},"required":["phase"]},"then":{"properties":{"turn":{"type":"null"},"currentWinner":{"type":"null"}}}};
const func2 = Object.prototype.hasOwnProperty;
const func3 = (typeof ajvRuntime1 === 'function' ? ajvRuntime1 : ajvRuntime1.default);

function validate25(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate25.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.plays === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plays"},message:"must have required property '"+"plays"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.winner === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "winner"},message:"must have required property '"+"winner"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "plays") || (key0 === "winner"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.plays !== undefined){
let data0 = data.plays;
if(Array.isArray(data0)){
if(data0.length > 4){
const err3 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 4){
const err4 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
if(!(validate23(data0[i0], {instancePath:instancePath+"/plays/" + i0,parentData:data0,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err5 = {instancePath:instancePath+"/plays",schemaPath:"#/properties/plays/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.winner !== undefined){
let data2 = data.winner;
if(!((((data2 === 0) || (data2 === 1)) || (data2 === 2)) || (data2 === 3))){
const err6 = {instancePath:instancePath+"/winner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate25.errors = vErrors;
return errors === 0;
}
validate25.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.points === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "points"},message:"must have required property '"+"points"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bags === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bags"},message:"must have required property '"+"bags"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "points") || (key0 === "bags")) || (key0 === "winner"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.points !== undefined){
let data0 = data.points;
if(Array.isArray(data0)){
if(data0.length > 4){
const err3 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data0.length < 4){
const err4 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
let data1 = data0[i0];
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err5 = {instancePath:instancePath+"/points/" + i0,schemaPath:"#/properties/points/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
else {
const err6 = {instancePath:instancePath+"/points",schemaPath:"#/properties/points/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.bags !== undefined){
let data2 = data.bags;
if(Array.isArray(data2)){
if(data2.length > 4){
const err7 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data2.length < 4){
const err8 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
const len1 = data2.length;
for(let i1=0; i1<len1; i1++){
let data3 = data2[i1];
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err9 = {instancePath:instancePath+"/bags/" + i1,schemaPath:"#/properties/bags/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 0 || isNaN(data3)){
const err10 = {instancePath:instancePath+"/bags/" + i1,schemaPath:"#/properties/bags/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
}
else {
const err11 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.winner !== undefined){
let data4 = data.winner;
if(!((((data4 === 0) || (data4 === 1)) || (data4 === 2)) || (data4 === 3))){
const err12 = {instancePath:instancePath+"/winner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
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
if(data.kind === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.bid === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "bid"},message:"must have required property '"+"bid"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "kind") || (key0 === "bid"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.kind !== undefined){
if("bid" !== data.kind){
const err3 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "bid"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.bid !== undefined){
let data1 = data.bid;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err4 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 13 || isNaN(data1)){
const err5 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data1 < 0 || isNaN(data1)){
const err6 = {instancePath:instancePath+"/bid",schemaPath:"#/oneOf/0/properties/bid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.card === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "card"},message:"must have required property '"+"card"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "kind") || (key1 === "card"))){
const err10 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.kind !== undefined){
if("play" !== data.kind){
const err11 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "play"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.card !== undefined){
let data3 = data.card;
if(typeof data3 === "string"){
if(!pattern4.test(data3)){
const err12 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
var _valid0 = _errs7 === errors;
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
const _errs14 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.kind === undefined){
const err15 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.cards === undefined){
const err16 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "cards"},message:"must have required property '"+"cards"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key2 in data){
if(!((key2 === "kind") || (key2 === "cards"))){
const err17 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined){
if("pass" !== data.kind){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/2/properties/kind/const",keyword:"const",params:{allowedValue: "pass"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.cards !== undefined){
let data5 = data.cards;
if(Array.isArray(data5)){
if(data5.length > 3){
const err19 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data5.length < 3){
const err20 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err21 = {instancePath:instancePath+"/cards/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/cards/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data5[i1], data5[j0])){
const err23 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err24 = {instancePath:instancePath+"/cards",schemaPath:"#/oneOf/2/properties/cards/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
var _valid0 = _errs14 === errors;
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
const err26 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
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
validate21.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate21.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate119(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate119.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs1 = errors;
let valid0 = true;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.phase === undefined) && (missing0 = "phase")){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(data.phase !== undefined){
if("pass" !== data.phase){
const err1 = {};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
}
var _valid0 = _errs2 === errors;
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs4 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.turn !== undefined){
if(data.turn !== null){
const err2 = {instancePath:instancePath+"/turn",schemaPath:"#/then/properties/turn/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.currentWinner !== undefined){
if(data.currentWinner !== null){
const err3 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/then/properties/currentWinner/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
var _valid0 = _errs4 === errors;
valid0 = _valid0;
if(valid0){
var props0 = {};
props0.turn = true;
props0.currentWinner = true;
props0.phase = true;
}
}
if(!valid0){
const err4 = {instancePath,schemaPath:"#/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.mode === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.phase === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "phase"},message:"must have required property '"+"phase"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.hand === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hand"},message:"must have required property '"+"hand"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.handCounts === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handCounts"},message:"must have required property '"+"handCounts"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.bids === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bids"},message:"must have required property '"+"bids"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.tricks === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tricks"},message:"must have required property '"+"tricks"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.scores === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scores"},message:"must have required property '"+"scores"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.bags === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bags"},message:"must have required property '"+"bags"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.trick === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "trick"},message:"must have required property '"+"trick"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.history === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "history"},message:"must have required property '"+"history"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.turn === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "turn"},message:"must have required property '"+"turn"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.dealer === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "dealer"},message:"must have required property '"+"dealer"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.handNumber === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.heartsBroken === undefined){
const err19 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "heartsBroken"},message:"must have required property '"+"heartsBroken"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.spadesBroken === undefined){
const err20 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "spadesBroken"},message:"must have required property '"+"spadesBroken"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.passDirection === undefined){
const err21 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "passDirection"},message:"must have required property '"+"passDirection"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.received === undefined){
const err22 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.outgoing === undefined){
const err23 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "outgoing"},message:"must have required property '"+"outgoing"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.handResult === undefined){
const err24 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handResult"},message:"must have required property '"+"handResult"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.currentWinner === undefined){
const err25 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentWinner"},message:"must have required property '"+"currentWinner"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.legalActions === undefined){
const err26 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "legalActions"},message:"must have required property '"+"legalActions"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema47.properties, key0))){
const err27 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.id !== undefined){
let data3 = data.id;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err28 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(func3(data3) < 1){
const err29 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.mode !== undefined){
let data4 = data.mode;
if(!(((data4 === "hearts") || (data4 === "spades-solo")) || (data4 === "spades-partners"))){
const err31 = {instancePath:instancePath+"/mode",schemaPath:"#/$defs/Mode/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.phase !== undefined){
let data5 = data.phase;
if(!((((((data5 === "pass") || (data5 === "bid")) || (data5 === "play")) || (data5 === "trick-end")) || (data5 === "hand-end")) || (data5 === "match-end"))){
const err32 = {instancePath:instancePath+"/phase",schemaPath:"#/$defs/Phase/enum",keyword:"enum",params:{allowedValues: schema36.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.hand !== undefined){
let data6 = data.hand;
if(Array.isArray(data6)){
if(data6.length > 13){
const err33 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
let data7 = data6[i0];
if(typeof data7 === "string"){
if(!pattern4.test(data7)){
const err34 = {instancePath:instancePath+"/hand/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/hand/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
let i1 = data6.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data6[i1], data6[j0])){
const err36 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err37 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.handCounts !== undefined){
let data8 = data.handCounts;
if(Array.isArray(data8)){
if(data8.length > 4){
const err38 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data8.length < 4){
const err39 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
const len1 = data8.length;
for(let i2=0; i2<len1; i2++){
let data9 = data8[i2];
if(!(((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9))) && (isFinite(data9)))){
const err40 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 > 13 || isNaN(data9)){
const err41 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data9 < 0 || isNaN(data9)){
const err42 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
}
else {
const err43 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.bids !== undefined){
let data10 = data.bids;
if(Array.isArray(data10)){
if(data10.length > 4){
const err44 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data10.length < 4){
const err45 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
const len2 = data10.length;
for(let i3=0; i3<len2; i3++){
let data11 = data10[i3];
const _errs28 = errors;
let valid14 = false;
const _errs29 = errors;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err46 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 > 13 || isNaN(data11)){
const err47 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(data11 < 0 || isNaN(data11)){
const err48 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
var _valid1 = _errs29 === errors;
valid14 = valid14 || _valid1;
const _errs31 = errors;
if(data11 !== null){
const err49 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var _valid1 = _errs31 === errors;
valid14 = valid14 || _valid1;
if(!valid14){
const err50 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
errors = _errs28;
if(vErrors !== null){
if(_errs28){
vErrors.length = _errs28;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err51 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.tricks !== undefined){
let data12 = data.tricks;
if(Array.isArray(data12)){
if(data12.length > 4){
const err52 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data12.length < 4){
const err53 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
const len3 = data12.length;
for(let i4=0; i4<len3; i4++){
let data13 = data12[i4];
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err54 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 13 || isNaN(data13)){
const err55 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(data13 < 0 || isNaN(data13)){
const err56 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
}
}
else {
const err57 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.scores !== undefined){
let data14 = data.scores;
if(Array.isArray(data14)){
if(data14.length > 4){
const err58 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data14.length < 4){
const err59 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
const len4 = data14.length;
for(let i5=0; i5<len4; i5++){
let data15 = data14[i5];
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err60 = {instancePath:instancePath+"/scores/" + i5,schemaPath:"#/properties/scores/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
}
else {
const err61 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.bags !== undefined){
let data16 = data.bags;
if(Array.isArray(data16)){
if(data16.length > 4){
const err62 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(data16.length < 4){
const err63 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
const len5 = data16.length;
for(let i6=0; i6<len5; i6++){
let data17 = data16[i6];
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err64 = {instancePath:instancePath+"/bags/" + i6,schemaPath:"#/properties/bags/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 < 0 || isNaN(data17)){
const err65 = {instancePath:instancePath+"/bags/" + i6,schemaPath:"#/properties/bags/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
}
else {
const err66 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data.trick !== undefined){
let data18 = data.trick;
if(Array.isArray(data18)){
if(data18.length > 4){
const err67 = {instancePath:instancePath+"/trick",schemaPath:"#/properties/trick/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
const len6 = data18.length;
for(let i7=0; i7<len6; i7++){
if(!(validate23(data18[i7], {instancePath:instancePath+"/trick/" + i7,parentData:data18,parentDataProperty:i7,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err68 = {instancePath:instancePath+"/trick",schemaPath:"#/properties/trick/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.history !== undefined){
let data20 = data.history;
if(Array.isArray(data20)){
if(data20.length > 13){
const err69 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
const len7 = data20.length;
for(let i8=0; i8<len7; i8++){
if(!(validate25(data20[i8], {instancePath:instancePath+"/history/" + i8,parentData:data20,parentDataProperty:i8,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err70 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.turn !== undefined){
let data22 = data.turn;
const _errs52 = errors;
let valid25 = false;
const _errs53 = errors;
if(!((((data22 === 0) || (data22 === 1)) || (data22 === 2)) || (data22 === 3))){
const err71 = {instancePath:instancePath+"/turn",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var _valid2 = _errs53 === errors;
valid25 = valid25 || _valid2;
const _errs55 = errors;
if(data22 !== null){
const err72 = {instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var _valid2 = _errs55 === errors;
valid25 = valid25 || _valid2;
if(!valid25){
const err73 = {instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
errors = _errs52;
if(vErrors !== null){
if(_errs52){
vErrors.length = _errs52;
}
else {
vErrors = null;
}
}
}
}
if(data.dealer !== undefined){
let data23 = data.dealer;
if(!((((data23 === 0) || (data23 === 1)) || (data23 === 2)) || (data23 === 3))){
const err74 = {instancePath:instancePath+"/dealer",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data24 = data.handNumber;
if(!(((typeof data24 == "number") && (!(data24 % 1) && !isNaN(data24))) && (isFinite(data24)))){
const err75 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 1 || isNaN(data24)){
const err76 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
if(data.heartsBroken !== undefined){
if(typeof data.heartsBroken !== "boolean"){
const err77 = {instancePath:instancePath+"/heartsBroken",schemaPath:"#/properties/heartsBroken/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.spadesBroken !== undefined){
if(typeof data.spadesBroken !== "boolean"){
const err78 = {instancePath:instancePath+"/spadesBroken",schemaPath:"#/properties/spadesBroken/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.passDirection !== undefined){
let data27 = data.passDirection;
if(!((((data27 === "left") || (data27 === "right")) || (data27 === "across")) || (data27 === "hold"))){
const err79 = {instancePath:instancePath+"/passDirection",schemaPath:"#/properties/passDirection/enum",keyword:"enum",params:{allowedValues: schema47.properties.passDirection.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data.received !== undefined){
let data28 = data.received;
if(Array.isArray(data28)){
if(data28.length > 3){
const err80 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
const len8 = data28.length;
for(let i9=0; i9<len8; i9++){
let data29 = data28[i9];
if(typeof data29 === "string"){
if(!pattern4.test(data29)){
const err81 = {instancePath:instancePath+"/received/" + i9,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/received/" + i9,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
let i10 = data28.length;
let j1;
if(i10 > 1){
outer1:
for(;i10--;){
for(j1 = i10; j1--;){
if(func0(data28[i10], data28[j1])){
const err83 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/uniqueItems",keyword:"uniqueItems",params:{i: i10, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i10+" are identical)"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err84 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data.outgoing !== undefined){
let data30 = data.outgoing;
if(Array.isArray(data30)){
if(data30.length > 3){
const err85 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
const len9 = data30.length;
for(let i11=0; i11<len9; i11++){
let data31 = data30[i11];
if(typeof data31 === "string"){
if(!pattern4.test(data31)){
const err86 = {instancePath:instancePath+"/outgoing/" + i11,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
else {
const err87 = {instancePath:instancePath+"/outgoing/" + i11,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
let i12 = data30.length;
let j2;
if(i12 > 1){
outer2:
for(;i12--;){
for(j2 = i12; j2--;){
if(func0(data30[i12], data30[j2])){
const err88 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/uniqueItems",keyword:"uniqueItems",params:{i: i12, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i12+" are identical)"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err89 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data.handResult !== undefined){
let data32 = data.handResult;
const _errs77 = errors;
let valid36 = false;
const _errs78 = errors;
if(!(validate28(data32, {instancePath:instancePath+"/handResult",parentData:data,parentDataProperty:"handResult",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var _valid3 = _errs78 === errors;
valid36 = valid36 || _valid3;
const _errs79 = errors;
if(data32 !== null){
const err90 = {instancePath:instancePath+"/handResult",schemaPath:"#/properties/handResult/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var _valid3 = _errs79 === errors;
valid36 = valid36 || _valid3;
if(!valid36){
const err91 = {instancePath:instancePath+"/handResult",schemaPath:"#/properties/handResult/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
else {
errors = _errs77;
if(vErrors !== null){
if(_errs77){
vErrors.length = _errs77;
}
else {
vErrors = null;
}
}
}
}
if(data.currentWinner !== undefined){
let data33 = data.currentWinner;
const _errs82 = errors;
let valid37 = false;
const _errs83 = errors;
if(!((((data33 === 0) || (data33 === 1)) || (data33 === 2)) || (data33 === 3))){
const err92 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var _valid4 = _errs83 === errors;
valid37 = valid37 || _valid4;
const _errs85 = errors;
if(data33 !== null){
const err93 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/properties/currentWinner/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var _valid4 = _errs85 === errors;
valid37 = valid37 || _valid4;
if(!valid37){
const err94 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/properties/currentWinner/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
else {
errors = _errs82;
if(vErrors !== null){
if(_errs82){
vErrors.length = _errs82;
}
else {
vErrors = null;
}
}
}
}
if(data.legalActions !== undefined){
let data34 = data.legalActions;
if(Array.isArray(data34)){
if(data34.length > 286){
const err95 = {instancePath:instancePath+"/legalActions",schemaPath:"#/properties/legalActions/maxItems",keyword:"maxItems",params:{limit: 286},message:"must NOT have more than 286 items"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
const len10 = data34.length;
for(let i13=0; i13<len10; i13++){
if(!(validate21(data34[i13], {instancePath:instancePath+"/legalActions/" + i13,parentData:data34,parentDataProperty:i13,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err96 = {instancePath:instancePath+"/legalActions",schemaPath:"#/properties/legalActions/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
}
else {
const err97 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
validate119.errors = vErrors;
return errors === 0;
}
validate119.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePreferences = validate124;
const schema56 = {"title":"Preferences","type":"object","properties":{"coachMode":{"enum":["asked","nudges","after"]},"gameSpeed":{"enum":[1,1.2,1.4]}},"required":["coachMode","gameSpeed"],"additionalProperties":false};

function validate124(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate124.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.coachMode === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coachMode"},message:"must have required property '"+"coachMode"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameSpeed === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameSpeed"},message:"must have required property '"+"gameSpeed"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "coachMode") || (key0 === "gameSpeed"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.coachMode !== undefined){
let data0 = data.coachMode;
if(!(((data0 === "asked") || (data0 === "nudges")) || (data0 === "after"))){
const err3 = {instancePath:instancePath+"/coachMode",schemaPath:"#/properties/coachMode/enum",keyword:"enum",params:{allowedValues: schema56.properties.coachMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.gameSpeed !== undefined){
let data1 = data.gameSpeed;
if(!(((data1 === 1) || (data1 === 1.2)) || (data1 === 1.4))){
const err4 = {instancePath:instancePath+"/gameSpeed",schemaPath:"#/properties/gameSpeed/enum",keyword:"enum",params:{allowedValues: schema56.properties.gameSpeed.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
validate124.errors = vErrors;
return errors === 0;
}
validate124.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePlan = validate125;
const schema57 = {"title":"Plan","enum":["demo","practice","unlimited","family"]};

function validate125(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate125.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!((((data === "demo") || (data === "practice")) || (data === "unlimited")) || (data === "family"))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema57.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate125.errors = vErrors;
return errors === 0;
}
validate125.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validatePaidPlan = validate126;
const schema58 = {"title":"PaidPlan","enum":["practice","unlimited","family"]};

function validate126(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate126.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(!(((data === "practice") || (data === "unlimited")) || (data === "family"))){
const err0 = {instancePath,schemaPath:"#/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
validate126.errors = vErrors;
return errors === 0;
}
validate126.evaluated = {"dynamicProps":false,"dynamicItems":false};

export const validateCoachAccess = validate127;
const schema59 = {"title":"CoachAccess","type":"object","properties":{"plan":{"$ref":"#/$defs/Plan"},"coverage":{"enum":["none","active","expired"]},"canPlay":{"type":"boolean"},"canCoach":{"type":"boolean"},"remainingHands":{"anyOf":[{"type":"integer","minimum":0},{"type":"null"}]},"resetsAt":{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]},"handUnlocked":{"type":"boolean"},"canStartWork":{"type":"boolean"},"localMock":{"type":"boolean"}},"required":["plan","coverage","canPlay","canCoach","remainingHands","resetsAt","handUnlocked","canStartWork","localMock"],"additionalProperties":false};

function validate127(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate127.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.plan === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.coverage === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coverage"},message:"must have required property '"+"coverage"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.canPlay === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canPlay"},message:"must have required property '"+"canPlay"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.canCoach === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canCoach"},message:"must have required property '"+"canCoach"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.remainingHands === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "remainingHands"},message:"must have required property '"+"remainingHands"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.resetsAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resetsAt"},message:"must have required property '"+"resetsAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.handUnlocked === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handUnlocked"},message:"must have required property '"+"handUnlocked"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.canStartWork === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canStartWork"},message:"must have required property '"+"canStartWork"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.localMock === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "localMock"},message:"must have required property '"+"localMock"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema59.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.plan !== undefined){
let data0 = data.plan;
if(!((((data0 === "demo") || (data0 === "practice")) || (data0 === "unlimited")) || (data0 === "family"))){
const err10 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/Plan/enum",keyword:"enum",params:{allowedValues: schema57.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.coverage !== undefined){
let data1 = data.coverage;
if(!(((data1 === "none") || (data1 === "active")) || (data1 === "expired"))){
const err11 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/enum",keyword:"enum",params:{allowedValues: schema59.properties.coverage.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.canPlay !== undefined){
if(typeof data.canPlay !== "boolean"){
const err12 = {instancePath:instancePath+"/canPlay",schemaPath:"#/properties/canPlay/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.canCoach !== undefined){
if(typeof data.canCoach !== "boolean"){
const err13 = {instancePath:instancePath+"/canCoach",schemaPath:"#/properties/canCoach/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.remainingHands !== undefined){
let data4 = data.remainingHands;
const _errs10 = errors;
let valid2 = false;
const _errs11 = errors;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/0/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
const _errs13 = errors;
if(data4 !== null){
const err16 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs13 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err17 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
if(data.resetsAt !== undefined){
let data5 = data.resetsAt;
const _errs16 = errors;
let valid3 = false;
const _errs17 = errors;
if(typeof data5 === "string"){
if(func3(data5) > 2000){
const err18 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid1 = _errs17 === errors;
valid3 = valid3 || _valid1;
const _errs19 = errors;
if(data5 !== null){
const err20 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid1 = _errs19 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err21 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs16;
if(vErrors !== null){
if(_errs16){
vErrors.length = _errs16;
}
else {
vErrors = null;
}
}
}
}
if(data.handUnlocked !== undefined){
if(typeof data.handUnlocked !== "boolean"){
const err22 = {instancePath:instancePath+"/handUnlocked",schemaPath:"#/properties/handUnlocked/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.canStartWork !== undefined){
if(typeof data.canStartWork !== "boolean"){
const err23 = {instancePath:instancePath+"/canStartWork",schemaPath:"#/properties/canStartWork/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.localMock !== undefined){
if(typeof data.localMock !== "boolean"){
const err24 = {instancePath:instancePath+"/localMock",schemaPath:"#/properties/localMock/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
validate127.errors = vErrors;
return errors === 0;
}
validate127.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSessionStats = validate128;
const schema61 = {"title":"SessionStats","type":"object","properties":{"decisions":{"type":"integer","minimum":0},"helped":{"type":"integer","minimum":0},"suggestions":{"type":"integer","minimum":0}},"required":["decisions","helped","suggestions"],"additionalProperties":false};

function validate128(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate128.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.decisions === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisions"},message:"must have required property '"+"decisions"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.helped === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "helped"},message:"must have required property '"+"helped"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.suggestions === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "suggestions"},message:"must have required property '"+"suggestions"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "decisions") || (key0 === "helped")) || (key0 === "suggestions"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.decisions !== undefined){
let data0 = data.decisions;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err4 = {instancePath:instancePath+"/decisions",schemaPath:"#/properties/decisions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if((typeof data0 == "number") && (isFinite(data0))){
if(data0 < 0 || isNaN(data0)){
const err5 = {instancePath:instancePath+"/decisions",schemaPath:"#/properties/decisions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
}
if(data.helped !== undefined){
let data1 = data.helped;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err6 = {instancePath:instancePath+"/helped",schemaPath:"#/properties/helped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 0 || isNaN(data1)){
const err7 = {instancePath:instancePath+"/helped",schemaPath:"#/properties/helped/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
if(data.suggestions !== undefined){
let data2 = data.suggestions;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err8 = {instancePath:instancePath+"/suggestions",schemaPath:"#/properties/suggestions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err9 = {instancePath:instancePath+"/suggestions",schemaPath:"#/properties/suggestions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
}
else {
const err10 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
validate128.errors = vErrors;
return errors === 0;
}
validate128.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSessionView = validate129;
const schema62 = {"title":"SessionView","type":"object","properties":{"game":{"$ref":"#/$defs/GameView"},"revision":{"type":"integer","minimum":0},"decisionId":{"type":"string","minLength":1,"maxLength":256},"preferences":{"$ref":"#/$defs/Preferences"},"access":{"$ref":"#/$defs/CoachAccess"},"source":{"enum":["code","demo"]},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"stats":{"$ref":"#/$defs/SessionStats"}},"required":["game","revision","decisionId","preferences","access","source","controlLeaseToken","stats"],"additionalProperties":false};

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs1 = errors;
let valid0 = true;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.phase === undefined) && (missing0 = "phase")){
const err0 = {};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(data.phase !== undefined){
if("pass" !== data.phase){
const err1 = {};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
}
var _valid0 = _errs2 === errors;
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
if(_valid0){
const _errs4 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.turn !== undefined){
if(data.turn !== null){
const err2 = {instancePath:instancePath+"/turn",schemaPath:"#/then/properties/turn/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.currentWinner !== undefined){
if(data.currentWinner !== null){
const err3 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/then/properties/currentWinner/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
var _valid0 = _errs4 === errors;
valid0 = _valid0;
if(valid0){
var props0 = {};
props0.turn = true;
props0.currentWinner = true;
props0.phase = true;
}
}
if(!valid0){
const err4 = {instancePath,schemaPath:"#/if",keyword:"if",params:{failingKeyword: "then"},message:"must match \"then\" schema"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.mode === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.phase === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "phase"},message:"must have required property '"+"phase"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.hand === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "hand"},message:"must have required property '"+"hand"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.handCounts === undefined){
const err9 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handCounts"},message:"must have required property '"+"handCounts"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.bids === undefined){
const err10 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bids"},message:"must have required property '"+"bids"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.tricks === undefined){
const err11 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "tricks"},message:"must have required property '"+"tricks"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(data.scores === undefined){
const err12 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "scores"},message:"must have required property '"+"scores"+"'"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(data.bags === undefined){
const err13 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "bags"},message:"must have required property '"+"bags"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data.trick === undefined){
const err14 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "trick"},message:"must have required property '"+"trick"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data.history === undefined){
const err15 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "history"},message:"must have required property '"+"history"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data.turn === undefined){
const err16 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "turn"},message:"must have required property '"+"turn"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(data.dealer === undefined){
const err17 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "dealer"},message:"must have required property '"+"dealer"+"'"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(data.handNumber === undefined){
const err18 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data.heartsBroken === undefined){
const err19 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "heartsBroken"},message:"must have required property '"+"heartsBroken"+"'"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(data.spadesBroken === undefined){
const err20 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "spadesBroken"},message:"must have required property '"+"spadesBroken"+"'"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if(data.passDirection === undefined){
const err21 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "passDirection"},message:"must have required property '"+"passDirection"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.received === undefined){
const err22 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.outgoing === undefined){
const err23 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "outgoing"},message:"must have required property '"+"outgoing"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.handResult === undefined){
const err24 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handResult"},message:"must have required property '"+"handResult"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.currentWinner === undefined){
const err25 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentWinner"},message:"must have required property '"+"currentWinner"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.legalActions === undefined){
const err26 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "legalActions"},message:"must have required property '"+"legalActions"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema47.properties, key0))){
const err27 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.id !== undefined){
let data3 = data.id;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err28 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(func3(data3) < 1){
const err29 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
else {
const err30 = {instancePath:instancePath+"/id",schemaPath:"#/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
if(data.mode !== undefined){
let data4 = data.mode;
if(!(((data4 === "hearts") || (data4 === "spades-solo")) || (data4 === "spades-partners"))){
const err31 = {instancePath:instancePath+"/mode",schemaPath:"#/$defs/Mode/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.phase !== undefined){
let data5 = data.phase;
if(!((((((data5 === "pass") || (data5 === "bid")) || (data5 === "play")) || (data5 === "trick-end")) || (data5 === "hand-end")) || (data5 === "match-end"))){
const err32 = {instancePath:instancePath+"/phase",schemaPath:"#/$defs/Phase/enum",keyword:"enum",params:{allowedValues: schema36.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.hand !== undefined){
let data6 = data.hand;
if(Array.isArray(data6)){
if(data6.length > 13){
const err33 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
let data7 = data6[i0];
if(typeof data7 === "string"){
if(!pattern4.test(data7)){
const err34 = {instancePath:instancePath+"/hand/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/hand/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
let i1 = data6.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data6[i1], data6[j0])){
const err36 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err37 = {instancePath:instancePath+"/hand",schemaPath:"#/properties/hand/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
}
if(data.handCounts !== undefined){
let data8 = data.handCounts;
if(Array.isArray(data8)){
if(data8.length > 4){
const err38 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
if(data8.length < 4){
const err39 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
const len1 = data8.length;
for(let i2=0; i2<len1; i2++){
let data9 = data8[i2];
if(!(((typeof data9 == "number") && (!(data9 % 1) && !isNaN(data9))) && (isFinite(data9)))){
const err40 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
if((typeof data9 == "number") && (isFinite(data9))){
if(data9 > 13 || isNaN(data9)){
const err41 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data9 < 0 || isNaN(data9)){
const err42 = {instancePath:instancePath+"/handCounts/" + i2,schemaPath:"#/properties/handCounts/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
}
}
else {
const err43 = {instancePath:instancePath+"/handCounts",schemaPath:"#/properties/handCounts/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
}
if(data.bids !== undefined){
let data10 = data.bids;
if(Array.isArray(data10)){
if(data10.length > 4){
const err44 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data10.length < 4){
const err45 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
const len2 = data10.length;
for(let i3=0; i3<len2; i3++){
let data11 = data10[i3];
const _errs28 = errors;
let valid14 = false;
const _errs29 = errors;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err46 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 > 13 || isNaN(data11)){
const err47 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(data11 < 0 || isNaN(data11)){
const err48 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/0/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
}
var _valid1 = _errs29 === errors;
valid14 = valid14 || _valid1;
const _errs31 = errors;
if(data11 !== null){
const err49 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
var _valid1 = _errs31 === errors;
valid14 = valid14 || _valid1;
if(!valid14){
const err50 = {instancePath:instancePath+"/bids/" + i3,schemaPath:"#/properties/bids/items/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
else {
errors = _errs28;
if(vErrors !== null){
if(_errs28){
vErrors.length = _errs28;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err51 = {instancePath:instancePath+"/bids",schemaPath:"#/properties/bids/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
if(data.tricks !== undefined){
let data12 = data.tricks;
if(Array.isArray(data12)){
if(data12.length > 4){
const err52 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
if(data12.length < 4){
const err53 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
const len3 = data12.length;
for(let i4=0; i4<len3; i4++){
let data13 = data12[i4];
if(!(((typeof data13 == "number") && (!(data13 % 1) && !isNaN(data13))) && (isFinite(data13)))){
const err54 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if((typeof data13 == "number") && (isFinite(data13))){
if(data13 > 13 || isNaN(data13)){
const err55 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(data13 < 0 || isNaN(data13)){
const err56 = {instancePath:instancePath+"/tricks/" + i4,schemaPath:"#/properties/tricks/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
}
}
else {
const err57 = {instancePath:instancePath+"/tricks",schemaPath:"#/properties/tricks/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
if(data.scores !== undefined){
let data14 = data.scores;
if(Array.isArray(data14)){
if(data14.length > 4){
const err58 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
if(data14.length < 4){
const err59 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
const len4 = data14.length;
for(let i5=0; i5<len4; i5++){
let data15 = data14[i5];
if(!(((typeof data15 == "number") && (!(data15 % 1) && !isNaN(data15))) && (isFinite(data15)))){
const err60 = {instancePath:instancePath+"/scores/" + i5,schemaPath:"#/properties/scores/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
}
else {
const err61 = {instancePath:instancePath+"/scores",schemaPath:"#/properties/scores/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.bags !== undefined){
let data16 = data.bags;
if(Array.isArray(data16)){
if(data16.length > 4){
const err62 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(data16.length < 4){
const err63 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/minItems",keyword:"minItems",params:{limit: 4},message:"must NOT have fewer than 4 items"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
const len5 = data16.length;
for(let i6=0; i6<len5; i6++){
let data17 = data16[i6];
if(!(((typeof data17 == "number") && (!(data17 % 1) && !isNaN(data17))) && (isFinite(data17)))){
const err64 = {instancePath:instancePath+"/bags/" + i6,schemaPath:"#/properties/bags/items/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if((typeof data17 == "number") && (isFinite(data17))){
if(data17 < 0 || isNaN(data17)){
const err65 = {instancePath:instancePath+"/bags/" + i6,schemaPath:"#/properties/bags/items/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
}
else {
const err66 = {instancePath:instancePath+"/bags",schemaPath:"#/properties/bags/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
}
if(data.trick !== undefined){
let data18 = data.trick;
if(Array.isArray(data18)){
if(data18.length > 4){
const err67 = {instancePath:instancePath+"/trick",schemaPath:"#/properties/trick/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
const len6 = data18.length;
for(let i7=0; i7<len6; i7++){
if(!(validate23(data18[i7], {instancePath:instancePath+"/trick/" + i7,parentData:data18,parentDataProperty:i7,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate23.errors : vErrors.concat(validate23.errors);
errors = vErrors.length;
}
}
}
else {
const err68 = {instancePath:instancePath+"/trick",schemaPath:"#/properties/trick/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.history !== undefined){
let data20 = data.history;
if(Array.isArray(data20)){
if(data20.length > 13){
const err69 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
const len7 = data20.length;
for(let i8=0; i8<len7; i8++){
if(!(validate25(data20[i8], {instancePath:instancePath+"/history/" + i8,parentData:data20,parentDataProperty:i8,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err70 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
if(data.turn !== undefined){
let data22 = data.turn;
const _errs52 = errors;
let valid25 = false;
const _errs53 = errors;
if(!((((data22 === 0) || (data22 === 1)) || (data22 === 2)) || (data22 === 3))){
const err71 = {instancePath:instancePath+"/turn",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var _valid2 = _errs53 === errors;
valid25 = valid25 || _valid2;
const _errs55 = errors;
if(data22 !== null){
const err72 = {instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var _valid2 = _errs55 === errors;
valid25 = valid25 || _valid2;
if(!valid25){
const err73 = {instancePath:instancePath+"/turn",schemaPath:"#/properties/turn/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
errors = _errs52;
if(vErrors !== null){
if(_errs52){
vErrors.length = _errs52;
}
else {
vErrors = null;
}
}
}
}
if(data.dealer !== undefined){
let data23 = data.dealer;
if(!((((data23 === 0) || (data23 === 1)) || (data23 === 2)) || (data23 === 3))){
const err74 = {instancePath:instancePath+"/dealer",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data24 = data.handNumber;
if(!(((typeof data24 == "number") && (!(data24 % 1) && !isNaN(data24))) && (isFinite(data24)))){
const err75 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 1 || isNaN(data24)){
const err76 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
}
if(data.heartsBroken !== undefined){
if(typeof data.heartsBroken !== "boolean"){
const err77 = {instancePath:instancePath+"/heartsBroken",schemaPath:"#/properties/heartsBroken/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
}
if(data.spadesBroken !== undefined){
if(typeof data.spadesBroken !== "boolean"){
const err78 = {instancePath:instancePath+"/spadesBroken",schemaPath:"#/properties/spadesBroken/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
if(data.passDirection !== undefined){
let data27 = data.passDirection;
if(!((((data27 === "left") || (data27 === "right")) || (data27 === "across")) || (data27 === "hold"))){
const err79 = {instancePath:instancePath+"/passDirection",schemaPath:"#/properties/passDirection/enum",keyword:"enum",params:{allowedValues: schema47.properties.passDirection.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
}
if(data.received !== undefined){
let data28 = data.received;
if(Array.isArray(data28)){
if(data28.length > 3){
const err80 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
const len8 = data28.length;
for(let i9=0; i9<len8; i9++){
let data29 = data28[i9];
if(typeof data29 === "string"){
if(!pattern4.test(data29)){
const err81 = {instancePath:instancePath+"/received/" + i9,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
else {
const err82 = {instancePath:instancePath+"/received/" + i9,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
let i10 = data28.length;
let j1;
if(i10 > 1){
outer1:
for(;i10--;){
for(j1 = i10; j1--;){
if(func0(data28[i10], data28[j1])){
const err83 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/uniqueItems",keyword:"uniqueItems",params:{i: i10, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i10+" are identical)"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err84 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
}
if(data.outgoing !== undefined){
let data30 = data.outgoing;
if(Array.isArray(data30)){
if(data30.length > 3){
const err85 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
const len9 = data30.length;
for(let i11=0; i11<len9; i11++){
let data31 = data30[i11];
if(typeof data31 === "string"){
if(!pattern4.test(data31)){
const err86 = {instancePath:instancePath+"/outgoing/" + i11,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
}
else {
const err87 = {instancePath:instancePath+"/outgoing/" + i11,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err87];
}
else {
vErrors.push(err87);
}
errors++;
}
}
let i12 = data30.length;
let j2;
if(i12 > 1){
outer2:
for(;i12--;){
for(j2 = i12; j2--;){
if(func0(data30[i12], data30[j2])){
const err88 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/uniqueItems",keyword:"uniqueItems",params:{i: i12, j: j2},message:"must NOT have duplicate items (items ## "+j2+" and "+i12+" are identical)"};
if(vErrors === null){
vErrors = [err88];
}
else {
vErrors.push(err88);
}
errors++;
break outer2;
}
}
}
}
}
else {
const err89 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err89];
}
else {
vErrors.push(err89);
}
errors++;
}
}
if(data.handResult !== undefined){
let data32 = data.handResult;
const _errs77 = errors;
let valid36 = false;
const _errs78 = errors;
if(!(validate28(data32, {instancePath:instancePath+"/handResult",parentData:data,parentDataProperty:"handResult",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var _valid3 = _errs78 === errors;
valid36 = valid36 || _valid3;
const _errs79 = errors;
if(data32 !== null){
const err90 = {instancePath:instancePath+"/handResult",schemaPath:"#/properties/handResult/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err90];
}
else {
vErrors.push(err90);
}
errors++;
}
var _valid3 = _errs79 === errors;
valid36 = valid36 || _valid3;
if(!valid36){
const err91 = {instancePath:instancePath+"/handResult",schemaPath:"#/properties/handResult/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err91];
}
else {
vErrors.push(err91);
}
errors++;
}
else {
errors = _errs77;
if(vErrors !== null){
if(_errs77){
vErrors.length = _errs77;
}
else {
vErrors = null;
}
}
}
}
if(data.currentWinner !== undefined){
let data33 = data.currentWinner;
const _errs82 = errors;
let valid37 = false;
const _errs83 = errors;
if(!((((data33 === 0) || (data33 === 1)) || (data33 === 2)) || (data33 === 3))){
const err92 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err92];
}
else {
vErrors.push(err92);
}
errors++;
}
var _valid4 = _errs83 === errors;
valid37 = valid37 || _valid4;
const _errs85 = errors;
if(data33 !== null){
const err93 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/properties/currentWinner/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err93];
}
else {
vErrors.push(err93);
}
errors++;
}
var _valid4 = _errs85 === errors;
valid37 = valid37 || _valid4;
if(!valid37){
const err94 = {instancePath:instancePath+"/currentWinner",schemaPath:"#/properties/currentWinner/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err94];
}
else {
vErrors.push(err94);
}
errors++;
}
else {
errors = _errs82;
if(vErrors !== null){
if(_errs82){
vErrors.length = _errs82;
}
else {
vErrors = null;
}
}
}
}
if(data.legalActions !== undefined){
let data34 = data.legalActions;
if(Array.isArray(data34)){
if(data34.length > 286){
const err95 = {instancePath:instancePath+"/legalActions",schemaPath:"#/properties/legalActions/maxItems",keyword:"maxItems",params:{limit: 286},message:"must NOT have more than 286 items"};
if(vErrors === null){
vErrors = [err95];
}
else {
vErrors.push(err95);
}
errors++;
}
const len10 = data34.length;
for(let i13=0; i13<len10; i13++){
if(!(validate21(data34[i13], {instancePath:instancePath+"/legalActions/" + i13,parentData:data34,parentDataProperty:i13,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err96 = {instancePath:instancePath+"/legalActions",schemaPath:"#/properties/legalActions/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err96];
}
else {
vErrors.push(err96);
}
errors++;
}
}
}
else {
const err97 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err97];
}
else {
vErrors.push(err97);
}
errors++;
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.plan === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.coverage === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coverage"},message:"must have required property '"+"coverage"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.canPlay === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canPlay"},message:"must have required property '"+"canPlay"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.canCoach === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canCoach"},message:"must have required property '"+"canCoach"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.remainingHands === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "remainingHands"},message:"must have required property '"+"remainingHands"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.resetsAt === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "resetsAt"},message:"must have required property '"+"resetsAt"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.handUnlocked === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handUnlocked"},message:"must have required property '"+"handUnlocked"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.canStartWork === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "canStartWork"},message:"must have required property '"+"canStartWork"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.localMock === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "localMock"},message:"must have required property '"+"localMock"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema59.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.plan !== undefined){
let data0 = data.plan;
if(!((((data0 === "demo") || (data0 === "practice")) || (data0 === "unlimited")) || (data0 === "family"))){
const err10 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/Plan/enum",keyword:"enum",params:{allowedValues: schema57.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.coverage !== undefined){
let data1 = data.coverage;
if(!(((data1 === "none") || (data1 === "active")) || (data1 === "expired"))){
const err11 = {instancePath:instancePath+"/coverage",schemaPath:"#/properties/coverage/enum",keyword:"enum",params:{allowedValues: schema59.properties.coverage.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.canPlay !== undefined){
if(typeof data.canPlay !== "boolean"){
const err12 = {instancePath:instancePath+"/canPlay",schemaPath:"#/properties/canPlay/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.canCoach !== undefined){
if(typeof data.canCoach !== "boolean"){
const err13 = {instancePath:instancePath+"/canCoach",schemaPath:"#/properties/canCoach/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.remainingHands !== undefined){
let data4 = data.remainingHands;
const _errs10 = errors;
let valid2 = false;
const _errs11 = errors;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err14 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/0/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err15 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/0/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
var _valid0 = _errs11 === errors;
valid2 = valid2 || _valid0;
const _errs13 = errors;
if(data4 !== null){
const err16 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
var _valid0 = _errs13 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err17 = {instancePath:instancePath+"/remainingHands",schemaPath:"#/properties/remainingHands/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
if(data.resetsAt !== undefined){
let data5 = data.resetsAt;
const _errs16 = errors;
let valid3 = false;
const _errs17 = errors;
if(typeof data5 === "string"){
if(func3(data5) > 2000){
const err18 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
var _valid1 = _errs17 === errors;
valid3 = valid3 || _valid1;
const _errs19 = errors;
if(data5 !== null){
const err20 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid1 = _errs19 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err21 = {instancePath:instancePath+"/resetsAt",schemaPath:"#/properties/resetsAt/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
else {
errors = _errs16;
if(vErrors !== null){
if(_errs16){
vErrors.length = _errs16;
}
else {
vErrors = null;
}
}
}
}
if(data.handUnlocked !== undefined){
if(typeof data.handUnlocked !== "boolean"){
const err22 = {instancePath:instancePath+"/handUnlocked",schemaPath:"#/properties/handUnlocked/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.canStartWork !== undefined){
if(typeof data.canStartWork !== "boolean"){
const err23 = {instancePath:instancePath+"/canStartWork",schemaPath:"#/properties/canStartWork/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.localMock !== undefined){
if(typeof data.localMock !== "boolean"){
const err24 = {instancePath:instancePath+"/localMock",schemaPath:"#/properties/localMock/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
}
else {
const err25 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate129(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate129.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.game === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "game"},message:"must have required property '"+"game"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.revision === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "revision"},message:"must have required property '"+"revision"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.decisionId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.preferences === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preferences"},message:"must have required property '"+"preferences"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.access === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "access"},message:"must have required property '"+"access"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.source === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.stats === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stats"},message:"must have required property '"+"stats"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "game") || (key0 === "revision")) || (key0 === "decisionId")) || (key0 === "preferences")) || (key0 === "access")) || (key0 === "source")) || (key0 === "controlLeaseToken")) || (key0 === "stats"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.game !== undefined){
if(!(validate30(data.game, {instancePath:instancePath+"/game",parentData:data,parentDataProperty:"game",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.revision !== undefined){
let data1 = data.revision;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err9 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 0 || isNaN(data1)){
const err10 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
if(data.decisionId !== undefined){
let data2 = data.decisionId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err11 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func3(data2) < 1){
const err12 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.preferences !== undefined){
let data3 = data.preferences;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.coachMode === undefined){
const err14 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "coachMode"},message:"must have required property '"+"coachMode"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data3.gameSpeed === undefined){
const err15 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "gameSpeed"},message:"must have required property '"+"gameSpeed"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data3){
if(!((key1 === "coachMode") || (key1 === "gameSpeed"))){
const err16 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data3.coachMode !== undefined){
let data4 = data3.coachMode;
if(!(((data4 === "asked") || (data4 === "nudges")) || (data4 === "after"))){
const err17 = {instancePath:instancePath+"/preferences/coachMode",schemaPath:"#/$defs/Preferences/properties/coachMode/enum",keyword:"enum",params:{allowedValues: schema56.properties.coachMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data3.gameSpeed !== undefined){
let data5 = data3.gameSpeed;
if(!(((data5 === 1) || (data5 === 1.2)) || (data5 === 1.4))){
const err18 = {instancePath:instancePath+"/preferences/gameSpeed",schemaPath:"#/$defs/Preferences/properties/gameSpeed/enum",keyword:"enum",params:{allowedValues: schema56.properties.gameSpeed.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.access !== undefined){
if(!(validate36(data.access, {instancePath:instancePath+"/access",parentData:data,parentDataProperty:"access",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.source !== undefined){
let data7 = data.source;
if(!((data7 === "code") || (data7 === "demo"))){
const err20 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema62.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.controlLeaseToken !== undefined){
let data8 = data.controlLeaseToken;
if(typeof data8 === "string"){
if(func3(data8) > 256){
const err21 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func3(data8) < 1){
const err22 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.stats !== undefined){
let data9 = data.stats;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.decisions === undefined){
const err24 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "decisions"},message:"must have required property '"+"decisions"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data9.helped === undefined){
const err25 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "helped"},message:"must have required property '"+"helped"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data9.suggestions === undefined){
const err26 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "suggestions"},message:"must have required property '"+"suggestions"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key2 in data9){
if(!(((key2 === "decisions") || (key2 === "helped")) || (key2 === "suggestions"))){
const err27 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data9.decisions !== undefined){
let data10 = data9.decisions;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err28 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
const err29 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
if(data9.helped !== undefined){
let data11 = data9.helped;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err30 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err31 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
if(data9.suggestions !== undefined){
let data12 = data9.suggestions;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err32 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 < 0 || isNaN(data12)){
const err33 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
}
else {
const err34 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
validate129.errors = vErrors;
return errors === 0;
}
validate129.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAdviceView = validate132;
const schema65 = {"title":"AdviceView","type":"object","properties":{"focus":{"type":"string","maxLength":2000},"notice":{"type":"string","maxLength":2000},"reason":{"type":"string","maxLength":2000},"suggestion":{"type":"string","maxLength":2000},"card":{"$ref":"#/$defs/Card"},"pass":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3,"minItems":3,"uniqueItems":true},"bid":{"type":"integer","minimum":0,"maximum":13},"highlightSuit":{"$ref":"#/$defs/Suit"},"source":{"enum":["code","jev","forced","fallback"]},"decisionId":{"type":"string","minLength":1,"maxLength":256},"requestedLevel":{"enum":[1,2,3]}},"required":["focus","notice","reason","suggestion","source","decisionId","requestedLevel"],"additionalProperties":false};

function validate132(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate132.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.focus === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "focus"},message:"must have required property '"+"focus"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.notice === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notice"},message:"must have required property '"+"notice"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.reason === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.suggestion === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "suggestion"},message:"must have required property '"+"suggestion"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.source === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.decisionId === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.requestedLevel === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requestedLevel"},message:"must have required property '"+"requestedLevel"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema65.properties, key0))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.focus !== undefined){
let data0 = data.focus;
if(typeof data0 === "string"){
if(func3(data0) > 2000){
const err8 = {instancePath:instancePath+"/focus",schemaPath:"#/properties/focus/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/focus",schemaPath:"#/properties/focus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.notice !== undefined){
let data1 = data.notice;
if(typeof data1 === "string"){
if(func3(data1) > 2000){
const err10 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.reason !== undefined){
let data2 = data.reason;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err12 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.suggestion !== undefined){
let data3 = data.suggestion;
if(typeof data3 === "string"){
if(func3(data3) > 2000){
const err14 = {instancePath:instancePath+"/suggestion",schemaPath:"#/properties/suggestion/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/suggestion",schemaPath:"#/properties/suggestion/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.card !== undefined){
let data4 = data.card;
if(typeof data4 === "string"){
if(!pattern4.test(data4)){
const err16 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.pass !== undefined){
let data5 = data.pass;
if(Array.isArray(data5)){
if(data5.length > 3){
const err18 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data5.length < 3){
const err19 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err20 = {instancePath:instancePath+"/pass/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/pass/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data5[i1], data5[j0])){
const err22 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err23 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.bid !== undefined){
let data7 = data.bid;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err24 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 13 || isNaN(data7)){
const err25 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data7 < 0 || isNaN(data7)){
const err26 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data.highlightSuit !== undefined){
let data8 = data.highlightSuit;
if(!((((data8 === "C") || (data8 === "D")) || (data8 === "H")) || (data8 === "S"))){
const err27 = {instancePath:instancePath+"/highlightSuit",schemaPath:"#/$defs/Suit/enum",keyword:"enum",params:{allowedValues: schema35.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.source !== undefined){
let data9 = data.source;
if(!((((data9 === "code") || (data9 === "jev")) || (data9 === "forced")) || (data9 === "fallback"))){
const err28 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema65.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data10 = data.decisionId;
if(typeof data10 === "string"){
if(func3(data10) > 256){
const err29 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func3(data10) < 1){
const err30 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.requestedLevel !== undefined){
let data11 = data.requestedLevel;
if(!(((data11 === 1) || (data11 === 2)) || (data11 === 3))){
const err32 = {instancePath:instancePath+"/requestedLevel",schemaPath:"#/properties/requestedLevel/enum",keyword:"enum",params:{allowedValues: schema65.properties.requestedLevel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
validate132.errors = vErrors;
return errors === 0;
}
validate132.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateCommandEnvelope = validate133;
const schema69 = {"title":"CommandEnvelope","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","gameId","expectedRevision","controlLeaseToken"],"additionalProperties":false};

function validate133(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate133.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err13 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func3(data3) < 1){
const err14 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate133.errors = vErrors;
return errors === 0;
}
validate133.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateNewSessionRequest = validate134;
const schema70 = {"title":"NewSessionRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"mode":{"$ref":"#/$defs/Mode"},"expectedActiveGameId":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]}},"required":["commandId","mode","expectedActiveGameId"],"additionalProperties":false};

function validate134(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate134.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.mode === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedActiveGameId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedActiveGameId"},message:"must have required property '"+"expectedActiveGameId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "commandId") || (key0 === "mode")) || (key0 === "expectedActiveGameId"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func3(data0) < 1){
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.mode !== undefined){
let data1 = data.mode;
if(!(((data1 === "hearts") || (data1 === "spades-solo")) || (data1 === "spades-partners"))){
const err7 = {instancePath:instancePath+"/mode",schemaPath:"#/$defs/Mode/enum",keyword:"enum",params:{allowedValues: schema32.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.expectedActiveGameId !== undefined){
let data2 = data.expectedActiveGameId;
const _errs7 = errors;
let valid2 = false;
const _errs8 = errors;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err8 = {instancePath:instancePath+"/expectedActiveGameId",schemaPath:"#/properties/expectedActiveGameId/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data2) < 1){
const err9 = {instancePath:instancePath+"/expectedActiveGameId",schemaPath:"#/properties/expectedActiveGameId/anyOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/expectedActiveGameId",schemaPath:"#/properties/expectedActiveGameId/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs8 === errors;
valid2 = valid2 || _valid0;
const _errs10 = errors;
if(data2 !== null){
const err11 = {instancePath:instancePath+"/expectedActiveGameId",schemaPath:"#/properties/expectedActiveGameId/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs10 === errors;
valid2 = valid2 || _valid0;
if(!valid2){
const err12 = {instancePath:instancePath+"/expectedActiveGameId",schemaPath:"#/properties/expectedActiveGameId/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
errors = _errs7;
if(vErrors !== null){
if(_errs7){
vErrors.length = _errs7;
}
else {
vErrors = null;
}
}
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate134.errors = vErrors;
return errors === 0;
}
validate134.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateActionsRequest = validate135;
const schema72 = {"title":"ActionsRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"action":{"$ref":"#/$defs/GameAction"}},"required":["commandId","gameId","expectedRevision","controlLeaseToken","action"],"additionalProperties":false};

function validate135(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate135.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.action === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken")) || (key0 === "action"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func3(data0) < 1){
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err9 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(func3(data1) < 1){
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err12 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err13 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err14 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func3(data3) < 1){
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.action !== undefined){
if(!(validate21(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
}
else {
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate135.errors = vErrors;
return errors === 0;
}
validate135.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePrepareRequest = validate137;
const schema73 = {"title":"PrepareRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","gameId","expectedRevision","controlLeaseToken"],"additionalProperties":false};

function validate137(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate137.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err13 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func3(data3) < 1){
const err14 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate137.errors = vErrors;
return errors === 0;
}
validate137.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePrepareView = validate138;
const schema74 = {"title":"PrepareView","type":"object","properties":{"preparedDecisionId":{"type":"string","minLength":1,"maxLength":256},"decisionId":{"type":"string","minLength":1,"maxLength":256},"revision":{"type":"integer","minimum":0},"source":{"enum":["code","forced"]}},"required":["preparedDecisionId","decisionId","revision","source"],"additionalProperties":false};

function validate138(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate138.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.preparedDecisionId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preparedDecisionId"},message:"must have required property '"+"preparedDecisionId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.decisionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.revision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "revision"},message:"must have required property '"+"revision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.source === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "preparedDecisionId") || (key0 === "decisionId")) || (key0 === "revision")) || (key0 === "source"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.preparedDecisionId !== undefined){
let data0 = data.preparedDecisionId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/properties/preparedDecisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/properties/preparedDecisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/properties/preparedDecisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data1 = data.decisionId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.revision !== undefined){
let data2 = data.revision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.source !== undefined){
let data3 = data.source;
if(!((data3 === "code") || (data3 === "forced"))){
const err13 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema74.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate138.errors = vErrors;
return errors === 0;
}
validate138.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAdvanceRequest = validate139;
const schema75 = {"title":"AdvanceRequest","oneOf":[{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"kind":{"const":"bot"},"preparedDecisionId":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","gameId","expectedRevision","controlLeaseToken","kind","preparedDecisionId"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"kind":{"const":"collect-trick"}},"required":["commandId","gameId","expectedRevision","controlLeaseToken","kind"],"additionalProperties":false}]};

function validate139(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate139.evaluated;
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
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.kind === undefined){
const err4 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.preparedDecisionId === undefined){
const err5 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "preparedDecisionId"},message:"must have required property '"+"preparedDecisionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken")) || (key0 === "kind")) || (key0 === "preparedDecisionId"))){
const err6 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data0) < 1){
const err8 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/0/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data1) < 1){
const err11 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/0/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/0/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err13 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/0/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err14 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/0/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/0/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func3(data3) < 1){
const err16 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/0/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/0/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.kind !== undefined){
if("bot" !== data.kind){
const err18 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/0/properties/kind/const",keyword:"const",params:{allowedValue: "bot"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.preparedDecisionId !== undefined){
let data5 = data.preparedDecisionId;
if(typeof data5 === "string"){
if(func3(data5) > 256){
const err19 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/oneOf/0/properties/preparedDecisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func3(data5) < 1){
const err20 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/oneOf/0/properties/preparedDecisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/preparedDecisionId",schemaPath:"#/oneOf/0/properties/preparedDecisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs15 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.gameId === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data.expectedRevision === undefined){
const err25 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err26 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data.kind === undefined){
const err27 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
for(const key1 in data){
if(!(((((key1 === "commandId") || (key1 === "gameId")) || (key1 === "expectedRevision")) || (key1 === "controlLeaseToken")) || (key1 === "kind"))){
const err28 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.commandId !== undefined){
let data6 = data.commandId;
if(typeof data6 === "string"){
if(func3(data6) > 256){
const err29 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func3(data6) < 1){
const err30 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.gameId !== undefined){
let data7 = data.gameId;
if(typeof data7 === "string"){
if(func3(data7) > 256){
const err32 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/1/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if(func3(data7) < 1){
const err33 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/1/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err34 = {instancePath:instancePath+"/gameId",schemaPath:"#/oneOf/1/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data8 = data.expectedRevision;
if(!(((typeof data8 == "number") && (!(data8 % 1) && !isNaN(data8))) && (isFinite(data8)))){
const err35 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/1/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if((typeof data8 == "number") && (isFinite(data8))){
if(data8 < 0 || isNaN(data8)){
const err36 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/oneOf/1/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data9 = data.controlLeaseToken;
if(typeof data9 === "string"){
if(func3(data9) > 256){
const err37 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/1/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
if(func3(data9) < 1){
const err38 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/1/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
else {
const err39 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/oneOf/1/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.kind !== undefined){
if("collect-trick" !== data.kind){
const err40 = {instancePath:instancePath+"/kind",schemaPath:"#/oneOf/1/properties/kind/const",keyword:"const",params:{allowedValue: "collect-trick"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
}
else {
const err41 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
var _valid0 = _errs15 === errors;
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
}
if(!valid0){
const err42 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
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
validate139.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate139.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateNextHandRequest = validate140;
const schema76 = {"title":"NextHandRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","gameId","expectedRevision","controlLeaseToken"],"additionalProperties":false};

function validate140(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate140.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err11 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err12 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err13 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func3(data3) < 1){
const err14 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate140.errors = vErrors;
return errors === 0;
}
validate140.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAdviceRequest = validate141;
const schema77 = {"title":"AdviceRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"decisionId":{"type":"string","minLength":1,"maxLength":256},"requestedLevel":{"enum":[1,2,3]}},"required":["commandId","gameId","expectedRevision","controlLeaseToken","decisionId","requestedLevel"],"additionalProperties":false};

function validate141(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate141.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.decisionId === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.requestedLevel === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requestedLevel"},message:"must have required property '"+"requestedLevel"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken")) || (key0 === "decisionId")) || (key0 === "requestedLevel"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err7 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data0) < 1){
const err8 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err10 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data1) < 1){
const err11 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err13 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err14 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err15 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func3(data3) < 1){
const err16 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data4 = data.decisionId;
if(typeof data4 === "string"){
if(func3(data4) > 256){
const err18 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func3(data4) < 1){
const err19 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.requestedLevel !== undefined){
let data5 = data.requestedLevel;
if(!(((data5 === 1) || (data5 === 2)) || (data5 === 3))){
const err21 = {instancePath:instancePath+"/requestedLevel",schemaPath:"#/properties/requestedLevel/enum",keyword:"enum",params:{allowedValues: schema77.properties.requestedLevel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
validate141.errors = vErrors;
return errors === 0;
}
validate141.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validatePreferencesRequest = validate142;
const schema78 = {"title":"PreferencesRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"preferences":{"$ref":"#/$defs/Preferences"}},"required":["commandId","preferences"],"additionalProperties":false};

function validate142(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate142.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.preferences === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preferences"},message:"must have required property '"+"preferences"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "commandId") || (key0 === "preferences"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err3 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func3(data0) < 1){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.preferences !== undefined){
let data1 = data.preferences;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.coachMode === undefined){
const err6 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "coachMode"},message:"must have required property '"+"coachMode"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data1.gameSpeed === undefined){
const err7 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "gameSpeed"},message:"must have required property '"+"gameSpeed"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "coachMode") || (key1 === "gameSpeed"))){
const err8 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data1.coachMode !== undefined){
let data2 = data1.coachMode;
if(!(((data2 === "asked") || (data2 === "nudges")) || (data2 === "after"))){
const err9 = {instancePath:instancePath+"/preferences/coachMode",schemaPath:"#/$defs/Preferences/properties/coachMode/enum",keyword:"enum",params:{allowedValues: schema56.properties.coachMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.gameSpeed !== undefined){
let data3 = data1.gameSpeed;
if(!(((data3 === 1) || (data3 === 1.2)) || (data3 === 1.4))){
const err10 = {instancePath:instancePath+"/preferences/gameSpeed",schemaPath:"#/$defs/Preferences/properties/gameSpeed/enum",keyword:"enum",params:{allowedValues: schema56.properties.gameSpeed.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
else {
const err11 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
else {
const err12 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
validate142.errors = vErrors;
return errors === 0;
}
validate142.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateHandUnlockRequest = validate143;
const schema80 = {"title":"HandUnlockRequest","type":"object","properties":{"requestId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"handId":{"type":"string","minLength":1,"maxLength":256},"decisionId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"requestedLevel":{"enum":[1,2,3]},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256}},"required":["requestId","gameId","handId","decisionId","expectedRevision","requestedLevel","controlLeaseToken"],"additionalProperties":false};

function validate143(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate143.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.requestId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requestId"},message:"must have required property '"+"requestId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.handId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handId"},message:"must have required property '"+"handId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.decisionId === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.expectedRevision === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.requestedLevel === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requestedLevel"},message:"must have required property '"+"requestedLevel"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "requestId") || (key0 === "gameId")) || (key0 === "handId")) || (key0 === "decisionId")) || (key0 === "expectedRevision")) || (key0 === "requestedLevel")) || (key0 === "controlLeaseToken"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.requestId !== undefined){
let data0 = data.requestId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err8 = {instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data0) < 1){
const err9 = {instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/requestId",schemaPath:"#/properties/requestId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err11 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func3(data1) < 1){
const err12 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.handId !== undefined){
let data2 = data.handId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err14 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(func3(data2) < 1){
const err15 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
else {
const err16 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data3 = data.decisionId;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err17 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func3(data3) < 1){
const err18 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data4 = data.expectedRevision;
if(!(((typeof data4 == "number") && (!(data4 % 1) && !isNaN(data4))) && (isFinite(data4)))){
const err20 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
if((typeof data4 == "number") && (isFinite(data4))){
if(data4 < 0 || isNaN(data4)){
const err21 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
if(data.requestedLevel !== undefined){
let data5 = data.requestedLevel;
if(!(((data5 === 1) || (data5 === 2)) || (data5 === 3))){
const err22 = {instancePath:instancePath+"/requestedLevel",schemaPath:"#/properties/requestedLevel/enum",keyword:"enum",params:{allowedValues: schema80.properties.requestedLevel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.controlLeaseToken !== undefined){
let data6 = data.controlLeaseToken;
if(typeof data6 === "string"){
if(func3(data6) > 256){
const err23 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(func3(data6) < 1){
const err24 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate143.errors = vErrors;
return errors === 0;
}
validate143.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateHandUnlockView = validate144;
const schema81 = {"title":"HandUnlockView","type":"object","properties":{"access":{"$ref":"#/$defs/CoachAccess"},"advice":{"$ref":"#/$defs/AdviceView"}},"required":["access","advice"],"additionalProperties":false};

function validate42(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate42.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.focus === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "focus"},message:"must have required property '"+"focus"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.notice === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notice"},message:"must have required property '"+"notice"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.reason === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "reason"},message:"must have required property '"+"reason"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.suggestion === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "suggestion"},message:"must have required property '"+"suggestion"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.source === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.decisionId === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.requestedLevel === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "requestedLevel"},message:"must have required property '"+"requestedLevel"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema65.properties, key0))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.focus !== undefined){
let data0 = data.focus;
if(typeof data0 === "string"){
if(func3(data0) > 2000){
const err8 = {instancePath:instancePath+"/focus",schemaPath:"#/properties/focus/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/focus",schemaPath:"#/properties/focus/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.notice !== undefined){
let data1 = data.notice;
if(typeof data1 === "string"){
if(func3(data1) > 2000){
const err10 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.reason !== undefined){
let data2 = data.reason;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err12 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/reason",schemaPath:"#/properties/reason/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.suggestion !== undefined){
let data3 = data.suggestion;
if(typeof data3 === "string"){
if(func3(data3) > 2000){
const err14 = {instancePath:instancePath+"/suggestion",schemaPath:"#/properties/suggestion/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/suggestion",schemaPath:"#/properties/suggestion/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.card !== undefined){
let data4 = data.card;
if(typeof data4 === "string"){
if(!pattern4.test(data4)){
const err16 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.pass !== undefined){
let data5 = data.pass;
if(Array.isArray(data5)){
if(data5.length > 3){
const err18 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(data5.length < 3){
const err19 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/minItems",keyword:"minItems",params:{limit: 3},message:"must NOT have fewer than 3 items"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err20 = {instancePath:instancePath+"/pass/" + i0,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/pass/" + i0,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
let i1 = data5.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data5[i1], data5[j0])){
const err22 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err23 = {instancePath:instancePath+"/pass",schemaPath:"#/properties/pass/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.bid !== undefined){
let data7 = data.bid;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err24 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 > 13 || isNaN(data7)){
const err25 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data7 < 0 || isNaN(data7)){
const err26 = {instancePath:instancePath+"/bid",schemaPath:"#/properties/bid/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
}
if(data.highlightSuit !== undefined){
let data8 = data.highlightSuit;
if(!((((data8 === "C") || (data8 === "D")) || (data8 === "H")) || (data8 === "S"))){
const err27 = {instancePath:instancePath+"/highlightSuit",schemaPath:"#/$defs/Suit/enum",keyword:"enum",params:{allowedValues: schema35.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data.source !== undefined){
let data9 = data.source;
if(!((((data9 === "code") || (data9 === "jev")) || (data9 === "forced")) || (data9 === "fallback"))){
const err28 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema65.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data10 = data.decisionId;
if(typeof data10 === "string"){
if(func3(data10) > 256){
const err29 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func3(data10) < 1){
const err30 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
if(data.requestedLevel !== undefined){
let data11 = data.requestedLevel;
if(!(((data11 === 1) || (data11 === 2)) || (data11 === 3))){
const err32 = {instancePath:instancePath+"/requestedLevel",schemaPath:"#/properties/requestedLevel/enum",keyword:"enum",params:{allowedValues: schema65.properties.requestedLevel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
}
else {
const err33 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
validate42.errors = vErrors;
return errors === 0;
}
validate42.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate144(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate144.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.access === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "access"},message:"must have required property '"+"access"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.advice === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "advice"},message:"must have required property '"+"advice"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "access") || (key0 === "advice"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.access !== undefined){
if(!(validate36(data.access, {instancePath:instancePath+"/access",parentData:data,parentDataProperty:"access",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.advice !== undefined){
if(!(validate42(data.advice, {instancePath:instancePath+"/advice",parentData:data,parentDataProperty:"advice",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate144.errors = vErrors;
return errors === 0;
}
validate144.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateExposureRequest = validate147;
const schema82 = {"title":"ExposureRequest","type":"object","properties":{"gameId":{"type":"string","minLength":1,"maxLength":256},"decisionId":{"type":"string","minLength":1,"maxLength":256},"eventId":{"type":"string","minLength":1,"maxLength":256},"displayedLevel":{"enum":[1,2,3]}},"required":["gameId","decisionId","eventId","displayedLevel"],"additionalProperties":false};

function validate147(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate147.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.gameId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.decisionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.eventId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "eventId"},message:"must have required property '"+"eventId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.displayedLevel === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayedLevel"},message:"must have required property '"+"displayedLevel"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "gameId") || (key0 === "decisionId")) || (key0 === "eventId")) || (key0 === "displayedLevel"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.gameId !== undefined){
let data0 = data.gameId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data1 = data.decisionId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.eventId !== undefined){
let data2 = data.eventId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err11 = {instancePath:instancePath+"/eventId",schemaPath:"#/properties/eventId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func3(data2) < 1){
const err12 = {instancePath:instancePath+"/eventId",schemaPath:"#/properties/eventId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/eventId",schemaPath:"#/properties/eventId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.displayedLevel !== undefined){
let data3 = data.displayedLevel;
if(!(((data3 === 1) || (data3 === 2)) || (data3 === 3))){
const err14 = {instancePath:instancePath+"/displayedLevel",schemaPath:"#/properties/displayedLevel/enum",keyword:"enum",params:{allowedValues: schema82.properties.displayedLevel.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
validate147.errors = vErrors;
return errors === 0;
}
validate147.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAcceptedView = validate148;
const schema83 = {"title":"AcceptedView","type":"object","properties":{"accepted":{"const":true}},"required":["accepted"],"additionalProperties":false};

function validate148(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate148.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.accepted === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "accepted"},message:"must have required property '"+"accepted"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "accepted")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.accepted !== undefined){
if(true !== data.accepted){
const err2 = {instancePath:instancePath+"/accepted",schemaPath:"#/properties/accepted/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate148.errors = vErrors;
return errors === 0;
}
validate148.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewFrame = validate149;
const schema84 = {"title":"ReviewFrame","type":"object","properties":{"game":{"$ref":"#/$defs/GameView"},"action":{"anyOf":[{"$ref":"#/$defs/GameAction"},{"type":"null"}]},"decisionId":{"type":"string","minLength":1,"maxLength":256},"notes":{"type":"array","items":{"type":"string","maxLength":2000},"maxItems":20}},"required":["game","action","decisionId","notes"],"additionalProperties":false};

function validate149(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate149.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.game === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "game"},message:"must have required property '"+"game"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.action === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.decisionId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.notes === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notes"},message:"must have required property '"+"notes"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "game") || (key0 === "action")) || (key0 === "decisionId")) || (key0 === "notes"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.game !== undefined){
if(!(validate30(data.game, {instancePath:instancePath+"/game",parentData:data,parentDataProperty:"game",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.action !== undefined){
let data1 = data.action;
const _errs4 = errors;
let valid1 = false;
const _errs5 = errors;
if(!(validate21(data1, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
var _valid0 = _errs5 === errors;
valid1 = valid1 || _valid0;
const _errs6 = errors;
if(data1 !== null){
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid0 = _errs6 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
}
if(data.decisionId !== undefined){
let data2 = data.decisionId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err7 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data2) < 1){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.notes !== undefined){
let data3 = data.notes;
if(Array.isArray(data3)){
if(data3.length > 20){
const err10 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxItems",keyword:"maxItems",params:{limit: 20},message:"must NOT have more than 20 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 === "string"){
if(func3(data4) > 2000){
const err11 = {instancePath:instancePath+"/notes/" + i0,schemaPath:"#/properties/notes/items/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/notes/" + i0,schemaPath:"#/properties/notes/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate149.errors = vErrors;
return errors === 0;
}
validate149.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewCase = validate152;
const schema85 = {"title":"ReviewCase","type":"object","properties":{"decisionId":{"type":"string","minLength":1,"maxLength":256},"handNumber":{"type":"integer","minimum":1},"action":{"$ref":"#/$defs/GameAction"},"assisted":{"type":"boolean"},"status":{"enum":["not-assessed","supported","reasonable","review"]},"summary":{"type":"string","maxLength":2000}},"required":["decisionId","handNumber","action","assisted","status","summary"],"additionalProperties":false};

function validate152(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate152.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.decisionId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.handNumber === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.action === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.assisted === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "assisted"},message:"must have required property '"+"assisted"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.summary === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "summary"},message:"must have required property '"+"summary"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "decisionId") || (key0 === "handNumber")) || (key0 === "action")) || (key0 === "assisted")) || (key0 === "status")) || (key0 === "summary"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data0 = data.decisionId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err7 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data0) < 1){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data1 = data.handNumber;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err10 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 1 || isNaN(data1)){
const err11 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
if(data.action !== undefined){
if(!(validate21(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data.assisted !== undefined){
if(typeof data.assisted !== "boolean"){
const err12 = {instancePath:instancePath+"/assisted",schemaPath:"#/properties/assisted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.status !== undefined){
let data4 = data.status;
if(!((((data4 === "not-assessed") || (data4 === "supported")) || (data4 === "reasonable")) || (data4 === "review"))){
const err13 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema85.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.summary !== undefined){
let data5 = data.summary;
if(typeof data5 === "string"){
if(func3(data5) > 2000){
const err14 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate152.errors = vErrors;
return errors === 0;
}
validate152.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewIndex = validate154;
const schema86 = {"title":"ReviewIndex","type":"object","properties":{"cases":{"type":"array","items":{"$ref":"#/$defs/ReviewCase"},"maxItems":1000}},"required":["cases"],"additionalProperties":false};

function validate59(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate59.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.decisionId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.handNumber === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.action === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.assisted === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "assisted"},message:"must have required property '"+"assisted"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.summary === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "summary"},message:"must have required property '"+"summary"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "decisionId") || (key0 === "handNumber")) || (key0 === "action")) || (key0 === "assisted")) || (key0 === "status")) || (key0 === "summary"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data0 = data.decisionId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err7 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data0) < 1){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data1 = data.handNumber;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err10 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 1 || isNaN(data1)){
const err11 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
if(data.action !== undefined){
if(!(validate21(data.action, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
}
if(data.assisted !== undefined){
if(typeof data.assisted !== "boolean"){
const err12 = {instancePath:instancePath+"/assisted",schemaPath:"#/properties/assisted/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.status !== undefined){
let data4 = data.status;
if(!((((data4 === "not-assessed") || (data4 === "supported")) || (data4 === "reasonable")) || (data4 === "review"))){
const err13 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema85.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.summary !== undefined){
let data5 = data.summary;
if(typeof data5 === "string"){
if(func3(data5) > 2000){
const err14 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/summary",schemaPath:"#/properties/summary/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate59.errors = vErrors;
return errors === 0;
}
validate59.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate154(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate154.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.cases === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cases"},message:"must have required property '"+"cases"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
for(const key0 in data){
if(!(key0 === "cases")){
const err1 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.cases !== undefined){
let data0 = data.cases;
if(Array.isArray(data0)){
if(data0.length > 1000){
const err2 = {instancePath:instancePath+"/cases",schemaPath:"#/properties/cases/maxItems",keyword:"maxItems",params:{limit: 1000},message:"must NOT have more than 1000 items"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
if(!(validate59(data0[i0], {instancePath:instancePath+"/cases/" + i0,parentData:data0,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate59.errors : vErrors.concat(validate59.errors);
errors = vErrors.length;
}
}
}
else {
const err3 = {instancePath:instancePath+"/cases",schemaPath:"#/properties/cases/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate154.errors = vErrors;
return errors === 0;
}
validate154.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewView = validate156;
const schema87 = {"title":"ReviewView","type":"object","properties":{"decisionId":{"type":"string","minLength":1,"maxLength":256},"label":{"const":"Original"},"liveRevision":{"type":"integer","minimum":0},"frames":{"type":"array","items":{"$ref":"#/$defs/ReviewFrame"},"maxItems":1000}},"required":["decisionId","label","liveRevision","frames"],"additionalProperties":false};

function validate55(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate55.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.game === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "game"},message:"must have required property '"+"game"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.action === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.decisionId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.notes === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notes"},message:"must have required property '"+"notes"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "game") || (key0 === "action")) || (key0 === "decisionId")) || (key0 === "notes"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.game !== undefined){
if(!(validate30(data.game, {instancePath:instancePath+"/game",parentData:data,parentDataProperty:"game",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.action !== undefined){
let data1 = data.action;
const _errs4 = errors;
let valid1 = false;
const _errs5 = errors;
if(!(validate21(data1, {instancePath:instancePath+"/action",parentData:data,parentDataProperty:"action",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
var _valid0 = _errs5 === errors;
valid1 = valid1 || _valid0;
const _errs6 = errors;
if(data1 !== null){
const err5 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid0 = _errs6 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
}
if(data.decisionId !== undefined){
let data2 = data.decisionId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err7 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data2) < 1){
const err8 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.notes !== undefined){
let data3 = data.notes;
if(Array.isArray(data3)){
if(data3.length > 20){
const err10 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/maxItems",keyword:"maxItems",params:{limit: 20},message:"must NOT have more than 20 items"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(typeof data4 === "string"){
if(func3(data4) > 2000){
const err11 = {instancePath:instancePath+"/notes/" + i0,schemaPath:"#/properties/notes/items/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/notes/" + i0,schemaPath:"#/properties/notes/items/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath:instancePath+"/notes",schemaPath:"#/properties/notes/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
validate55.errors = vErrors;
return errors === 0;
}
validate55.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate156(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate156.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.decisionId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.label === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.liveRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "liveRevision"},message:"must have required property '"+"liveRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.frames === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "frames"},message:"must have required property '"+"frames"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "decisionId") || (key0 === "label")) || (key0 === "liveRevision")) || (key0 === "frames"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data0 = data.decisionId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.label !== undefined){
if("Original" !== data.label){
const err8 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/const",keyword:"const",params:{allowedValue: "Original"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.liveRevision !== undefined){
let data2 = data.liveRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err9 = {instancePath:instancePath+"/liveRevision",schemaPath:"#/properties/liveRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err10 = {instancePath:instancePath+"/liveRevision",schemaPath:"#/properties/liveRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
if(data.frames !== undefined){
let data3 = data.frames;
if(Array.isArray(data3)){
if(data3.length > 1000){
const err11 = {instancePath:instancePath+"/frames",schemaPath:"#/properties/frames/maxItems",keyword:"maxItems",params:{limit: 1000},message:"must NOT have more than 1000 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
if(!(validate55(data3[i0], {instancePath:instancePath+"/frames/" + i0,parentData:data3,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
errors = vErrors.length;
}
}
}
else {
const err12 = {instancePath:instancePath+"/frames",schemaPath:"#/properties/frames/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate156.errors = vErrors;
return errors === 0;
}
validate156.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateTrialRequest = validate158;
const schema88 = {"title":"TrialRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"gameId":{"type":"string","minLength":1,"maxLength":256},"expectedRevision":{"type":"integer","minimum":0},"controlLeaseToken":{"type":"string","minLength":1,"maxLength":256},"trialId":{"type":"string","minLength":1,"maxLength":256},"alternative":{"type":"object","properties":{"kind":{"const":"play"},"card":{"$ref":"#/$defs/Card"}},"required":["kind","card"],"additionalProperties":false},"decisionId":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","gameId","expectedRevision","controlLeaseToken","trialId","alternative","decisionId"],"additionalProperties":false};

function validate158(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate158.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.gameId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.expectedRevision === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expectedRevision"},message:"must have required property '"+"expectedRevision"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.trialId === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "trialId"},message:"must have required property '"+"trialId"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.alternative === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "alternative"},message:"must have required property '"+"alternative"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.decisionId === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "commandId") || (key0 === "gameId")) || (key0 === "expectedRevision")) || (key0 === "controlLeaseToken")) || (key0 === "trialId")) || (key0 === "alternative")) || (key0 === "decisionId"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err8 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data0) < 1){
const err9 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.gameId !== undefined){
let data1 = data.gameId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err11 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func3(data1) < 1){
const err12 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/gameId",schemaPath:"#/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.expectedRevision !== undefined){
let data2 = data.expectedRevision;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err14 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 < 0 || isNaN(data2)){
const err15 = {instancePath:instancePath+"/expectedRevision",schemaPath:"#/properties/expectedRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
if(data.controlLeaseToken !== undefined){
let data3 = data.controlLeaseToken;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err16 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
if(func3(data3) < 1){
const err17 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.trialId !== undefined){
let data4 = data.trialId;
if(typeof data4 === "string"){
if(func3(data4) > 256){
const err19 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if(func3(data4) < 1){
const err20 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.alternative !== undefined){
let data5 = data.alternative;
if(data5 && typeof data5 == "object" && !Array.isArray(data5)){
if(data5.kind === undefined){
const err22 = {instancePath:instancePath+"/alternative",schemaPath:"#/properties/alternative/required",keyword:"required",params:{missingProperty: "kind"},message:"must have required property '"+"kind"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data5.card === undefined){
const err23 = {instancePath:instancePath+"/alternative",schemaPath:"#/properties/alternative/required",keyword:"required",params:{missingProperty: "card"},message:"must have required property '"+"card"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
for(const key1 in data5){
if(!((key1 === "kind") || (key1 === "card"))){
const err24 = {instancePath:instancePath+"/alternative",schemaPath:"#/properties/alternative/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
if(data5.kind !== undefined){
if("play" !== data5.kind){
const err25 = {instancePath:instancePath+"/alternative/kind",schemaPath:"#/properties/alternative/properties/kind/const",keyword:"const",params:{allowedValue: "play"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data5.card !== undefined){
let data7 = data5.card;
if(typeof data7 === "string"){
if(!pattern4.test(data7)){
const err26 = {instancePath:instancePath+"/alternative/card",schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
else {
const err27 = {instancePath:instancePath+"/alternative/card",schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/alternative",schemaPath:"#/properties/alternative/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data8 = data.decisionId;
if(typeof data8 === "string"){
if(func3(data8) > 256){
const err29 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(func3(data8) < 1){
const err30 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
}
else {
const err31 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
else {
const err32 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
validate158.errors = vErrors;
return errors === 0;
}
validate158.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewTrial = validate159;
const schema90 = {"title":"ReviewTrial","type":"object","properties":{"trialId":{"type":"string","minLength":1,"maxLength":256},"decisionId":{"type":"string","minLength":1,"maxLength":256},"label":{"const":"Possible continuation"},"liveRevision":{"type":"integer","minimum":0},"frames":{"type":"array","items":{"$ref":"#/$defs/ReviewFrame"},"maxItems":5}},"required":["trialId","decisionId","label","liveRevision","frames"],"additionalProperties":false};

function validate159(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate159.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.trialId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "trialId"},message:"must have required property '"+"trialId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.decisionId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.label === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "label"},message:"must have required property '"+"label"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.liveRevision === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "liveRevision"},message:"must have required property '"+"liveRevision"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.frames === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "frames"},message:"must have required property '"+"frames"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "trialId") || (key0 === "decisionId")) || (key0 === "label")) || (key0 === "liveRevision")) || (key0 === "frames"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.trialId !== undefined){
let data0 = data.trialId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err6 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func3(data0) < 1){
const err7 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/trialId",schemaPath:"#/properties/trialId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.decisionId !== undefined){
let data1 = data.decisionId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err9 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(func3(data1) < 1){
const err10 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
else {
const err11 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.label !== undefined){
if("Possible continuation" !== data.label){
const err12 = {instancePath:instancePath+"/label",schemaPath:"#/properties/label/const",keyword:"const",params:{allowedValue: "Possible continuation"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.liveRevision !== undefined){
let data3 = data.liveRevision;
if(!(((typeof data3 == "number") && (!(data3 % 1) && !isNaN(data3))) && (isFinite(data3)))){
const err13 = {instancePath:instancePath+"/liveRevision",schemaPath:"#/properties/liveRevision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if((typeof data3 == "number") && (isFinite(data3))){
if(data3 < 0 || isNaN(data3)){
const err14 = {instancePath:instancePath+"/liveRevision",schemaPath:"#/properties/liveRevision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
if(data.frames !== undefined){
let data4 = data.frames;
if(Array.isArray(data4)){
if(data4.length > 5){
const err15 = {instancePath:instancePath+"/frames",schemaPath:"#/properties/frames/maxItems",keyword:"maxItems",params:{limit: 5},message:"must NOT have more than 5 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
const len0 = data4.length;
for(let i0=0; i0<len0; i0++){
if(!(validate55(data4[i0], {instancePath:instancePath+"/frames/" + i0,parentData:data4,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
errors = vErrors.length;
}
}
}
else {
const err16 = {instancePath:instancePath+"/frames",schemaPath:"#/properties/frames/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate159.errors = vErrors;
return errors === 0;
}
validate159.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateRecapView = validate161;
const schema91 = {"title":"RecapView","type":"object","properties":{"handNumber":{"type":"integer","minimum":1},"result":{"anyOf":[{"$ref":"#/$defs/HandResult"},{"type":"null"}]},"assessmentStatus":{"enum":["pending","ready","partial"]},"message":{"type":"string","maxLength":2000},"stats":{"$ref":"#/$defs/SessionStats"}},"required":["handNumber","result","assessmentStatus","message","stats"],"additionalProperties":false};

function validate161(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate161.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.handNumber === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.result === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "result"},message:"must have required property '"+"result"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.assessmentStatus === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "assessmentStatus"},message:"must have required property '"+"assessmentStatus"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.message === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.stats === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stats"},message:"must have required property '"+"stats"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "handNumber") || (key0 === "result")) || (key0 === "assessmentStatus")) || (key0 === "message")) || (key0 === "stats"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data0 = data.handNumber;
if(!(((typeof data0 == "number") && (!(data0 % 1) && !isNaN(data0))) && (isFinite(data0)))){
const err6 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data0 == "number") && (isFinite(data0))){
if(data0 < 1 || isNaN(data0)){
const err7 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
if(data.result !== undefined){
let data1 = data.result;
const _errs5 = errors;
let valid1 = false;
const _errs6 = errors;
if(!(validate28(data1, {instancePath:instancePath+"/result",parentData:data,parentDataProperty:"result",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var _valid0 = _errs6 === errors;
valid1 = valid1 || _valid0;
const _errs7 = errors;
if(data1 !== null){
const err8 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs7 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err9 = {instancePath:instancePath+"/result",schemaPath:"#/properties/result/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
errors = _errs5;
if(vErrors !== null){
if(_errs5){
vErrors.length = _errs5;
}
else {
vErrors = null;
}
}
}
}
if(data.assessmentStatus !== undefined){
let data2 = data.assessmentStatus;
if(!(((data2 === "pending") || (data2 === "ready")) || (data2 === "partial"))){
const err10 = {instancePath:instancePath+"/assessmentStatus",schemaPath:"#/properties/assessmentStatus/enum",keyword:"enum",params:{allowedValues: schema91.properties.assessmentStatus.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.message !== undefined){
let data3 = data.message;
if(typeof data3 === "string"){
if(func3(data3) > 2000){
const err11 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.stats !== undefined){
let data4 = data.stats;
if(data4 && typeof data4 == "object" && !Array.isArray(data4)){
if(data4.decisions === undefined){
const err13 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "decisions"},message:"must have required property '"+"decisions"+"'"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(data4.helped === undefined){
const err14 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "helped"},message:"must have required property '"+"helped"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data4.suggestions === undefined){
const err15 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "suggestions"},message:"must have required property '"+"suggestions"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data4){
if(!(((key1 === "decisions") || (key1 === "helped")) || (key1 === "suggestions"))){
const err16 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data4.decisions !== undefined){
let data5 = data4.decisions;
if(!(((typeof data5 == "number") && (!(data5 % 1) && !isNaN(data5))) && (isFinite(data5)))){
const err17 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if((typeof data5 == "number") && (isFinite(data5))){
if(data5 < 0 || isNaN(data5)){
const err18 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
if(data4.helped !== undefined){
let data6 = data4.helped;
if(!(((typeof data6 == "number") && (!(data6 % 1) && !isNaN(data6))) && (isFinite(data6)))){
const err19 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
if((typeof data6 == "number") && (isFinite(data6))){
if(data6 < 0 || isNaN(data6)){
const err20 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
if(data4.suggestions !== undefined){
let data7 = data4.suggestions;
if(!(((typeof data7 == "number") && (!(data7 % 1) && !isNaN(data7))) && (isFinite(data7)))){
const err21 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if((typeof data7 == "number") && (isFinite(data7))){
if(data7 < 0 || isNaN(data7)){
const err22 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
}
}
else {
const err23 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
}
else {
const err24 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
validate161.errors = vErrors;
return errors === 0;
}
validate161.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSubscriptionView = validate163;
const schema93 = {"title":"SubscriptionView","type":"object","properties":{"status":{"enum":["none","active","past_due","canceled","local-mock"]},"plan":{"anyOf":[{"$ref":"#/$defs/PaidPlan"},{"type":"null"}]},"cancelAtPeriodEnd":{"type":"boolean"},"currentPeriodEnd":{"anyOf":[{"type":"string","maxLength":2000},{"type":"null"}]},"billingAvailable":{"type":"boolean"}},"required":["status","plan","cancelAtPeriodEnd","currentPeriodEnd","billingAvailable"],"additionalProperties":false};

function validate163(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate163.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.plan === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.cancelAtPeriodEnd === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cancelAtPeriodEnd"},message:"must have required property '"+"cancelAtPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.currentPeriodEnd === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentPeriodEnd"},message:"must have required property '"+"currentPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.billingAvailable === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billingAvailable"},message:"must have required property '"+"billingAvailable"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "status") || (key0 === "plan")) || (key0 === "cancelAtPeriodEnd")) || (key0 === "currentPeriodEnd")) || (key0 === "billingAvailable"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.status !== undefined){
let data0 = data.status;
if(!(((((data0 === "none") || (data0 === "active")) || (data0 === "past_due")) || (data0 === "canceled")) || (data0 === "local-mock"))){
const err6 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema93.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.plan !== undefined){
let data1 = data.plan;
const _errs4 = errors;
let valid1 = false;
const _errs5 = errors;
if(!(((data1 === "practice") || (data1 === "unlimited")) || (data1 === "family"))){
const err7 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid1 = valid1 || _valid0;
const _errs7 = errors;
if(data1 !== null){
const err8 = {instancePath:instancePath+"/plan",schemaPath:"#/properties/plan/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs7 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err9 = {instancePath:instancePath+"/plan",schemaPath:"#/properties/plan/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
}
if(data.cancelAtPeriodEnd !== undefined){
if(typeof data.cancelAtPeriodEnd !== "boolean"){
const err10 = {instancePath:instancePath+"/cancelAtPeriodEnd",schemaPath:"#/properties/cancelAtPeriodEnd/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.currentPeriodEnd !== undefined){
let data3 = data.currentPeriodEnd;
const _errs12 = errors;
let valid3 = false;
const _errs13 = errors;
if(typeof data3 === "string"){
if(func3(data3) > 2000){
const err11 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid1 = _errs13 === errors;
valid3 = valid3 || _valid1;
const _errs15 = errors;
if(data3 !== null){
const err13 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err14 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
}
if(data.billingAvailable !== undefined){
if(typeof data.billingAvailable !== "boolean"){
const err15 = {instancePath:instancePath+"/billingAvailable",schemaPath:"#/properties/billingAvailable/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate163.errors = vErrors;
return errors === 0;
}
validate163.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateOfferView = validate164;
const schema95 = {"title":"OfferView","type":"object","properties":{"id":{"$ref":"#/$defs/PaidPlan"},"name":{"type":"string","maxLength":2000},"description":{"type":"string","maxLength":2000},"price":{"type":"null"},"currency":{"type":"null"}},"required":["id","name","description","price","currency"],"additionalProperties":false};

function validate164(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate164.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.name === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.description === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.price === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "price"},message:"must have required property '"+"price"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.currency === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "name")) || (key0 === "description")) || (key0 === "price")) || (key0 === "currency"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(!(((data0 === "practice") || (data0 === "unlimited")) || (data0 === "family"))){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.name !== undefined){
let data1 = data.name;
if(typeof data1 === "string"){
if(func3(data1) > 2000){
const err7 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.description !== undefined){
let data2 = data.description;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err9 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.price !== undefined){
if(data.price !== null){
const err11 = {instancePath:instancePath+"/price",schemaPath:"#/properties/price/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.currency !== undefined){
if(data.currency !== null){
const err12 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate164.errors = vErrors;
return errors === 0;
}
validate164.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAccountView = validate165;
const schema97 = {"title":"AccountView","type":"object","properties":{"authMode":{"enum":["local-test","managed"]},"player":{"type":"object","properties":{"displayName":{"type":"string","minLength":1,"maxLength":100},"id":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}},"required":["displayName","id"],"additionalProperties":false},"access":{"$ref":"#/$defs/CoachAccess"},"subscription":{"$ref":"#/$defs/SubscriptionView"},"offers":{"type":"array","items":{"$ref":"#/$defs/OfferView"},"maxItems":3}},"required":["authMode","player","access","subscription","offers"],"additionalProperties":false};
const pattern14 = new RegExp("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", "u");

function validate76(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate76.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.status === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.plan === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.cancelAtPeriodEnd === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cancelAtPeriodEnd"},message:"must have required property '"+"cancelAtPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.currentPeriodEnd === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currentPeriodEnd"},message:"must have required property '"+"currentPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.billingAvailable === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billingAvailable"},message:"must have required property '"+"billingAvailable"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "status") || (key0 === "plan")) || (key0 === "cancelAtPeriodEnd")) || (key0 === "currentPeriodEnd")) || (key0 === "billingAvailable"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.status !== undefined){
let data0 = data.status;
if(!(((((data0 === "none") || (data0 === "active")) || (data0 === "past_due")) || (data0 === "canceled")) || (data0 === "local-mock"))){
const err6 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema93.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.plan !== undefined){
let data1 = data.plan;
const _errs4 = errors;
let valid1 = false;
const _errs5 = errors;
if(!(((data1 === "practice") || (data1 === "unlimited")) || (data1 === "family"))){
const err7 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs5 === errors;
valid1 = valid1 || _valid0;
const _errs7 = errors;
if(data1 !== null){
const err8 = {instancePath:instancePath+"/plan",schemaPath:"#/properties/plan/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
var _valid0 = _errs7 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err9 = {instancePath:instancePath+"/plan",schemaPath:"#/properties/plan/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
else {
errors = _errs4;
if(vErrors !== null){
if(_errs4){
vErrors.length = _errs4;
}
else {
vErrors = null;
}
}
}
}
if(data.cancelAtPeriodEnd !== undefined){
if(typeof data.cancelAtPeriodEnd !== "boolean"){
const err10 = {instancePath:instancePath+"/cancelAtPeriodEnd",schemaPath:"#/properties/cancelAtPeriodEnd/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.currentPeriodEnd !== undefined){
let data3 = data.currentPeriodEnd;
const _errs12 = errors;
let valid3 = false;
const _errs13 = errors;
if(typeof data3 === "string"){
if(func3(data3) > 2000){
const err11 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
var _valid1 = _errs13 === errors;
valid3 = valid3 || _valid1;
const _errs15 = errors;
if(data3 !== null){
const err13 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
var _valid1 = _errs15 === errors;
valid3 = valid3 || _valid1;
if(!valid3){
const err14 = {instancePath:instancePath+"/currentPeriodEnd",schemaPath:"#/properties/currentPeriodEnd/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
else {
errors = _errs12;
if(vErrors !== null){
if(_errs12){
vErrors.length = _errs12;
}
else {
vErrors = null;
}
}
}
}
if(data.billingAvailable !== undefined){
if(typeof data.billingAvailable !== "boolean"){
const err15 = {instancePath:instancePath+"/billingAvailable",schemaPath:"#/properties/billingAvailable/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
}
else {
const err16 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
validate76.errors = vErrors;
return errors === 0;
}
validate76.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate78(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate78.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.id === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.name === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "name"},message:"must have required property '"+"name"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.description === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "description"},message:"must have required property '"+"description"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.price === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "price"},message:"must have required property '"+"price"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.currency === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "id") || (key0 === "name")) || (key0 === "description")) || (key0 === "price")) || (key0 === "currency"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.id !== undefined){
let data0 = data.id;
if(!(((data0 === "practice") || (data0 === "unlimited")) || (data0 === "family"))){
const err6 = {instancePath:instancePath+"/id",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.name !== undefined){
let data1 = data.name;
if(typeof data1 === "string"){
if(func3(data1) > 2000){
const err7 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/name",schemaPath:"#/properties/name/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.description !== undefined){
let data2 = data.description;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err9 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/description",schemaPath:"#/properties/description/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.price !== undefined){
if(data.price !== null){
const err11 = {instancePath:instancePath+"/price",schemaPath:"#/properties/price/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.currency !== undefined){
if(data.currency !== null){
const err12 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
}
else {
const err13 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
validate78.errors = vErrors;
return errors === 0;
}
validate78.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate165(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate165.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.authMode === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "authMode"},message:"must have required property '"+"authMode"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.player === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "player"},message:"must have required property '"+"player"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.access === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "access"},message:"must have required property '"+"access"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.subscription === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subscription"},message:"must have required property '"+"subscription"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.offers === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "offers"},message:"must have required property '"+"offers"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "authMode") || (key0 === "player")) || (key0 === "access")) || (key0 === "subscription")) || (key0 === "offers"))){
const err5 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.authMode !== undefined){
let data0 = data.authMode;
if(!((data0 === "local-test") || (data0 === "managed"))){
const err6 = {instancePath:instancePath+"/authMode",schemaPath:"#/properties/authMode/enum",keyword:"enum",params:{allowedValues: schema97.properties.authMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.player !== undefined){
let data1 = data.player;
if(data1 && typeof data1 == "object" && !Array.isArray(data1)){
if(data1.displayName === undefined){
const err7 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1.id === undefined){
const err8 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key1 in data1){
if(!((key1 === "displayName") || (key1 === "id"))){
const err9 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data1.displayName !== undefined){
let data2 = data1.displayName;
if(typeof data2 === "string"){
if(func3(data2) > 100){
const err10 = {instancePath:instancePath+"/player/displayName",schemaPath:"#/properties/player/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 100},message:"must NOT have more than 100 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data2) < 1){
const err11 = {instancePath:instancePath+"/player/displayName",schemaPath:"#/properties/player/properties/displayName/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/player/displayName",schemaPath:"#/properties/player/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data1.id !== undefined){
let data3 = data1.id;
if(typeof data3 === "string"){
if(!pattern14.test(data3)){
const err13 = {instancePath:instancePath+"/player/id",schemaPath:"#/properties/player/properties/id/pattern",keyword:"pattern",params:{pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},message:"must match pattern \""+"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"+"\""};
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
const err14 = {instancePath:instancePath+"/player/id",schemaPath:"#/properties/player/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
}
else {
const err15 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.access !== undefined){
if(!(validate36(data.access, {instancePath:instancePath+"/access",parentData:data,parentDataProperty:"access",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.subscription !== undefined){
if(!(validate76(data.subscription, {instancePath:instancePath+"/subscription",parentData:data,parentDataProperty:"subscription",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate76.errors : vErrors.concat(validate76.errors);
errors = vErrors.length;
}
}
if(data.offers !== undefined){
let data6 = data.offers;
if(Array.isArray(data6)){
if(data6.length > 3){
const err16 = {instancePath:instancePath+"/offers",schemaPath:"#/properties/offers/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
if(!(validate78(data6[i0], {instancePath:instancePath+"/offers/" + i0,parentData:data6,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate78.errors : vErrors.concat(validate78.errors);
errors = vErrors.length;
}
}
}
else {
const err17 = {instancePath:instancePath+"/offers",schemaPath:"#/properties/offers/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate165.errors = vErrors;
return errors === 0;
}
validate165.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAccountCommand = validate169;
const schema98 = {"title":"AccountCommand","oneOf":[{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"select-plan"},"plan":{"$ref":"#/$defs/PaidPlan"}},"required":["commandId","action","plan"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"enum":["cancel","resume"]}},"required":["commandId","action"],"additionalProperties":false}]};

function validate169(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate169.evaluated;
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
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.action === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.plan === undefined){
const err2 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "commandId") || (key0 === "action")) || (key0 === "plan"))){
const err3 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(func3(data0) < 1){
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
else {
const err6 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.action !== undefined){
if("select-plan" !== data.action){
const err7 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/0/properties/action/const",keyword:"const",params:{allowedValue: "select-plan"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.plan !== undefined){
let data2 = data.plan;
if(!(((data2 === "practice") || (data2 === "unlimited")) || (data2 === "family"))){
const err8 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs9 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.action === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key1 in data){
if(!((key1 === "commandId") || (key1 === "action"))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.commandId !== undefined){
let data3 = data.commandId;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err13 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func3(data3) < 1){
const err14 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.action !== undefined){
let data4 = data.action;
if(!((data4 === "cancel") || (data4 === "resume"))){
const err16 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/1/properties/action/enum",keyword:"enum",params:{allowedValues: schema98.oneOf[1].properties.action.enum},message:"must be equal to one of the allowed values"};
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
const err17 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
var _valid0 = _errs9 === errors;
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
}
if(!valid0){
const err18 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
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
validate169.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate169.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateApiError = validate170;
const schema100 = {"title":"ApiError","type":"object","properties":{"code":{"enum":["UNAUTHENTICATED","FORBIDDEN","STALE_REVISION","LEASE_LOST","QUOTA_EXHAUSTED","INVALID_COMMAND","IDEMPOTENCY_CONFLICT","NOT_FOUND","PAYMENT_PENDING","SERVICE_UNAVAILABLE"]},"message":{"type":"string","maxLength":2000},"current":{"$ref":"#/$defs/SessionView"}},"required":["code","message"],"additionalProperties":false};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.game === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "game"},message:"must have required property '"+"game"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.revision === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "revision"},message:"must have required property '"+"revision"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.decisionId === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "decisionId"},message:"must have required property '"+"decisionId"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.preferences === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "preferences"},message:"must have required property '"+"preferences"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.access === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "access"},message:"must have required property '"+"access"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.source === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "source"},message:"must have required property '"+"source"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.controlLeaseToken === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "controlLeaseToken"},message:"must have required property '"+"controlLeaseToken"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.stats === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "stats"},message:"must have required property '"+"stats"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "game") || (key0 === "revision")) || (key0 === "decisionId")) || (key0 === "preferences")) || (key0 === "access")) || (key0 === "source")) || (key0 === "controlLeaseToken")) || (key0 === "stats"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.game !== undefined){
if(!(validate30(data.game, {instancePath:instancePath+"/game",parentData:data,parentDataProperty:"game",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
}
if(data.revision !== undefined){
let data1 = data.revision;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err9 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 < 0 || isNaN(data1)){
const err10 = {instancePath:instancePath+"/revision",schemaPath:"#/properties/revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
}
if(data.decisionId !== undefined){
let data2 = data.decisionId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err11 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
if(func3(data2) < 1){
const err12 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/decisionId",schemaPath:"#/properties/decisionId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.preferences !== undefined){
let data3 = data.preferences;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.coachMode === undefined){
const err14 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "coachMode"},message:"must have required property '"+"coachMode"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data3.gameSpeed === undefined){
const err15 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "gameSpeed"},message:"must have required property '"+"gameSpeed"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data3){
if(!((key1 === "coachMode") || (key1 === "gameSpeed"))){
const err16 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data3.coachMode !== undefined){
let data4 = data3.coachMode;
if(!(((data4 === "asked") || (data4 === "nudges")) || (data4 === "after"))){
const err17 = {instancePath:instancePath+"/preferences/coachMode",schemaPath:"#/$defs/Preferences/properties/coachMode/enum",keyword:"enum",params:{allowedValues: schema56.properties.coachMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data3.gameSpeed !== undefined){
let data5 = data3.gameSpeed;
if(!(((data5 === 1) || (data5 === 1.2)) || (data5 === 1.4))){
const err18 = {instancePath:instancePath+"/preferences/gameSpeed",schemaPath:"#/$defs/Preferences/properties/gameSpeed/enum",keyword:"enum",params:{allowedValues: schema56.properties.gameSpeed.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
}
else {
const err19 = {instancePath:instancePath+"/preferences",schemaPath:"#/$defs/Preferences/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data.access !== undefined){
if(!(validate36(data.access, {instancePath:instancePath+"/access",parentData:data,parentDataProperty:"access",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
}
if(data.source !== undefined){
let data7 = data.source;
if(!((data7 === "code") || (data7 === "demo"))){
const err20 = {instancePath:instancePath+"/source",schemaPath:"#/properties/source/enum",keyword:"enum",params:{allowedValues: schema62.properties.source.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.controlLeaseToken !== undefined){
let data8 = data.controlLeaseToken;
if(typeof data8 === "string"){
if(func3(data8) > 256){
const err21 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(func3(data8) < 1){
const err22 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
else {
const err23 = {instancePath:instancePath+"/controlLeaseToken",schemaPath:"#/properties/controlLeaseToken/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.stats !== undefined){
let data9 = data.stats;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.decisions === undefined){
const err24 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "decisions"},message:"must have required property '"+"decisions"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
if(data9.helped === undefined){
const err25 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "helped"},message:"must have required property '"+"helped"+"'"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
if(data9.suggestions === undefined){
const err26 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "suggestions"},message:"must have required property '"+"suggestions"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
for(const key2 in data9){
if(!(((key2 === "decisions") || (key2 === "helped")) || (key2 === "suggestions"))){
const err27 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
if(data9.decisions !== undefined){
let data10 = data9.decisions;
if(!(((typeof data10 == "number") && (!(data10 % 1) && !isNaN(data10))) && (isFinite(data10)))){
const err28 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if((typeof data10 == "number") && (isFinite(data10))){
if(data10 < 0 || isNaN(data10)){
const err29 = {instancePath:instancePath+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
}
if(data9.helped !== undefined){
let data11 = data9.helped;
if(!(((typeof data11 == "number") && (!(data11 % 1) && !isNaN(data11))) && (isFinite(data11)))){
const err30 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if((typeof data11 == "number") && (isFinite(data11))){
if(data11 < 0 || isNaN(data11)){
const err31 = {instancePath:instancePath+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
}
if(data9.suggestions !== undefined){
let data12 = data9.suggestions;
if(!(((typeof data12 == "number") && (!(data12 % 1) && !isNaN(data12))) && (isFinite(data12)))){
const err32 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
if((typeof data12 == "number") && (isFinite(data12))){
if(data12 < 0 || isNaN(data12)){
const err33 = {instancePath:instancePath+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
}
else {
const err34 = {instancePath:instancePath+"/stats",schemaPath:"#/$defs/SessionStats/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
}
else {
const err35 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate170(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate170.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.code === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "code"},message:"must have required property '"+"code"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.message === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "code") || (key0 === "message")) || (key0 === "current"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.code !== undefined){
let data0 = data.code;
if(!((((((((((data0 === "UNAUTHENTICATED") || (data0 === "FORBIDDEN")) || (data0 === "STALE_REVISION")) || (data0 === "LEASE_LOST")) || (data0 === "QUOTA_EXHAUSTED")) || (data0 === "INVALID_COMMAND")) || (data0 === "IDEMPOTENCY_CONFLICT")) || (data0 === "NOT_FOUND")) || (data0 === "PAYMENT_PENDING")) || (data0 === "SERVICE_UNAVAILABLE"))){
const err3 = {instancePath:instancePath+"/code",schemaPath:"#/properties/code/enum",keyword:"enum",params:{allowedValues: schema100.properties.code.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.message !== undefined){
let data1 = data.message;
if(typeof data1 === "string"){
if(func3(data1) > 2000){
const err4 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.current !== undefined){
if(!(validate38(data.current, {instancePath:instancePath+"/current",parentData:data,parentDataProperty:"current",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
}
}
else {
const err6 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
validate170.errors = vErrors;
return errors === 0;
}
validate170.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewQuery = validate172;
const schema101 = {"title":"ReviewQuery","type":"object","properties":{"scope":{"enum":["hand","match"]},"handNumber":{"type":"string","pattern":"^[1-9][0-9]{0,5}$"}},"required":[],"additionalProperties":false};
const pattern15 = new RegExp("^[1-9][0-9]{0,5}$", "u");

function validate172(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate172.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!((key0 === "scope") || (key0 === "handNumber"))){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.scope !== undefined){
let data0 = data.scope;
if(!((data0 === "hand") || (data0 === "match"))){
const err1 = {instancePath:instancePath+"/scope",schemaPath:"#/properties/scope/enum",keyword:"enum",params:{allowedValues: schema101.properties.scope.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
if(data.handNumber !== undefined){
let data1 = data.handNumber;
if(typeof data1 === "string"){
if(!pattern15.test(data1)){
const err2 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/pattern",keyword:"pattern",params:{pattern: "^[1-9][0-9]{0,5}$"},message:"must match pattern \""+"^[1-9][0-9]{0,5}$"+"\""};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/handNumber",schemaPath:"#/properties/handNumber/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate172.errors = vErrors;
return errors === 0;
}
validate172.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateReviewStepQuery = validate173;
const schema102 = {"title":"ReviewStepQuery","type":"object","properties":{"step":{"type":"string","pattern":"^(0|[1-9][0-9]{0,5})$"}},"required":[],"additionalProperties":false};
const pattern16 = new RegExp("^(0|[1-9][0-9]{0,5})$", "u");

function validate173(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate173.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(key0 === "step")){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.step !== undefined){
let data0 = data.step;
if(typeof data0 === "string"){
if(!pattern16.test(data0)){
const err1 = {instancePath:instancePath+"/step",schemaPath:"#/properties/step/pattern",keyword:"pattern",params:{pattern: "^(0|[1-9][0-9]{0,5})$"},message:"must match pattern \""+"^(0|[1-9][0-9]{0,5})$"+"\""};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
else {
const err2 = {instancePath:instancePath+"/step",schemaPath:"#/properties/step/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
}
else {
const err3 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
validate173.errors = vErrors;
return errors === 0;
}
validate173.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAccessQuery = validate174;
const schema103 = {"title":"AccessQuery","type":"object","properties":{"handId":{"type":"string","minLength":1,"maxLength":256}},"required":[],"additionalProperties":false};

function validate174(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate174.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
for(const key0 in data){
if(!(key0 === "handId")){
const err0 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
}
if(data.handId !== undefined){
let data0 = data.handId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err1 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(func3(data0) < 1){
const err2 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
else {
const err3 = {instancePath:instancePath+"/handId",schemaPath:"#/properties/handId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
else {
const err4 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
validate174.errors = vErrors;
return errors === 0;
}
validate174.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateSuitMemory = validate175;
const schema104 = {"title":"SuitMemory","type":"object","properties":{"suit":{"$ref":"#/$defs/Suit"},"played":{"type":"integer","minimum":0,"maximum":13},"remaining":{"type":"integer","minimum":0,"maximum":13},"voidSeats":{"type":"array","items":{"$ref":"#/$defs/Seat"},"maxItems":4,"uniqueItems":true},"playedCards":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":13,"uniqueItems":true}},"required":["suit","played","remaining","voidSeats"],"additionalProperties":false};

function validate175(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate175.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.suit === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "suit"},message:"must have required property '"+"suit"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.played === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "played"},message:"must have required property '"+"played"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.remaining === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "remaining"},message:"must have required property '"+"remaining"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.voidSeats === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "voidSeats"},message:"must have required property '"+"voidSeats"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "suit") || (key0 === "played")) || (key0 === "remaining")) || (key0 === "voidSeats")) || (key0 === "playedCards"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.suit !== undefined){
let data0 = data.suit;
if(!((((data0 === "C") || (data0 === "D")) || (data0 === "H")) || (data0 === "S"))){
const err5 = {instancePath:instancePath+"/suit",schemaPath:"#/$defs/Suit/enum",keyword:"enum",params:{allowedValues: schema35.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.played !== undefined){
let data1 = data.played;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err6 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 13 || isNaN(data1)){
const err7 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1 < 0 || isNaN(data1)){
const err8 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
if(data.remaining !== undefined){
let data2 = data.remaining;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err9 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 13 || isNaN(data2)){
const err10 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data2 < 0 || isNaN(data2)){
const err11 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
if(data.voidSeats !== undefined){
let data3 = data.voidSeats;
if(Array.isArray(data3)){
if(data3.length > 4){
const err12 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(!((((data4 === 0) || (data4 === 1)) || (data4 === 2)) || (data4 === 3))){
const err13 = {instancePath:instancePath+"/voidSeats/" + i0,schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
const err14 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err15 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.playedCards !== undefined){
let data5 = data.playedCards;
if(Array.isArray(data5)){
if(data5.length > 13){
const err16 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len1 = data5.length;
for(let i2=0; i2<len1; i2++){
let data6 = data5[i2];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err17 = {instancePath:instancePath+"/playedCards/" + i2,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/playedCards/" + i2,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
let i3 = data5.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func0(data5[i3], data5[j1])){
const err19 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err20 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate175.errors = vErrors;
return errors === 0;
}
validate175.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateNotesView = validate176;
const schema108 = {"title":"NotesView","type":"object","properties":{"memory":{"type":"array","items":{"$ref":"#/$defs/SuitMemory"},"maxItems":4},"outgoing":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3},"received":{"type":"array","items":{"$ref":"#/$defs/Card"},"maxItems":3},"history":{"type":"array","items":{"$ref":"#/$defs/Trick"},"maxItems":13}},"required":["memory","outgoing","received","history"],"additionalProperties":false};

function validate90(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate90.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.suit === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "suit"},message:"must have required property '"+"suit"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.played === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "played"},message:"must have required property '"+"played"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.remaining === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "remaining"},message:"must have required property '"+"remaining"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.voidSeats === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "voidSeats"},message:"must have required property '"+"voidSeats"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "suit") || (key0 === "played")) || (key0 === "remaining")) || (key0 === "voidSeats")) || (key0 === "playedCards"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.suit !== undefined){
let data0 = data.suit;
if(!((((data0 === "C") || (data0 === "D")) || (data0 === "H")) || (data0 === "S"))){
const err5 = {instancePath:instancePath+"/suit",schemaPath:"#/$defs/Suit/enum",keyword:"enum",params:{allowedValues: schema35.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.played !== undefined){
let data1 = data.played;
if(!(((typeof data1 == "number") && (!(data1 % 1) && !isNaN(data1))) && (isFinite(data1)))){
const err6 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if((typeof data1 == "number") && (isFinite(data1))){
if(data1 > 13 || isNaN(data1)){
const err7 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data1 < 0 || isNaN(data1)){
const err8 = {instancePath:instancePath+"/played",schemaPath:"#/properties/played/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
if(data.remaining !== undefined){
let data2 = data.remaining;
if(!(((typeof data2 == "number") && (!(data2 % 1) && !isNaN(data2))) && (isFinite(data2)))){
const err9 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if((typeof data2 == "number") && (isFinite(data2))){
if(data2 > 13 || isNaN(data2)){
const err10 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/maximum",keyword:"maximum",params:{comparison: "<=", limit: 13},message:"must be <= 13"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data2 < 0 || isNaN(data2)){
const err11 = {instancePath:instancePath+"/remaining",schemaPath:"#/properties/remaining/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
}
if(data.voidSeats !== undefined){
let data3 = data.voidSeats;
if(Array.isArray(data3)){
if(data3.length > 4){
const err12 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
if(!((((data4 === 0) || (data4 === 1)) || (data4 === 2)) || (data4 === 3))){
const err13 = {instancePath:instancePath+"/voidSeats/" + i0,schemaPath:"#/$defs/Seat/enum",keyword:"enum",params:{allowedValues: schema33.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
const err14 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
break outer0;
}
}
}
}
}
else {
const err15 = {instancePath:instancePath+"/voidSeats",schemaPath:"#/properties/voidSeats/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.playedCards !== undefined){
let data5 = data.playedCards;
if(Array.isArray(data5)){
if(data5.length > 13){
const err16 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
const len1 = data5.length;
for(let i2=0; i2<len1; i2++){
let data6 = data5[i2];
if(typeof data6 === "string"){
if(!pattern4.test(data6)){
const err17 = {instancePath:instancePath+"/playedCards/" + i2,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/playedCards/" + i2,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
let i3 = data5.length;
let j1;
if(i3 > 1){
outer1:
for(;i3--;){
for(j1 = i3; j1--;){
if(func0(data5[i3], data5[j1])){
const err19 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/uniqueItems",keyword:"uniqueItems",params:{i: i3, j: j1},message:"must NOT have duplicate items (items ## "+j1+" and "+i3+" are identical)"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
break outer1;
}
}
}
}
}
else {
const err20 = {instancePath:instancePath+"/playedCards",schemaPath:"#/properties/playedCards/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
}
else {
const err21 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
validate90.errors = vErrors;
return errors === 0;
}
validate90.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate176(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate176.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.memory === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "memory"},message:"must have required property '"+"memory"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.outgoing === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "outgoing"},message:"must have required property '"+"outgoing"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.received === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "received"},message:"must have required property '"+"received"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.history === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "history"},message:"must have required property '"+"history"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!((((key0 === "memory") || (key0 === "outgoing")) || (key0 === "received")) || (key0 === "history"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.memory !== undefined){
let data0 = data.memory;
if(Array.isArray(data0)){
if(data0.length > 4){
const err5 = {instancePath:instancePath+"/memory",schemaPath:"#/properties/memory/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
const len0 = data0.length;
for(let i0=0; i0<len0; i0++){
if(!(validate90(data0[i0], {instancePath:instancePath+"/memory/" + i0,parentData:data0,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate90.errors : vErrors.concat(validate90.errors);
errors = vErrors.length;
}
}
}
else {
const err6 = {instancePath:instancePath+"/memory",schemaPath:"#/properties/memory/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.outgoing !== undefined){
let data2 = data.outgoing;
if(Array.isArray(data2)){
if(data2.length > 3){
const err7 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
const len1 = data2.length;
for(let i1=0; i1<len1; i1++){
let data3 = data2[i1];
if(typeof data3 === "string"){
if(!pattern4.test(data3)){
const err8 = {instancePath:instancePath+"/outgoing/" + i1,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/outgoing/" + i1,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
}
else {
const err10 = {instancePath:instancePath+"/outgoing",schemaPath:"#/properties/outgoing/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.received !== undefined){
let data4 = data.received;
if(Array.isArray(data4)){
if(data4.length > 3){
const err11 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/maxItems",keyword:"maxItems",params:{limit: 3},message:"must NOT have more than 3 items"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
const len2 = data4.length;
for(let i2=0; i2<len2; i2++){
let data5 = data4[i2];
if(typeof data5 === "string"){
if(!pattern4.test(data5)){
const err12 = {instancePath:instancePath+"/received/" + i2,schemaPath:"#/$defs/Card/pattern",keyword:"pattern",params:{pattern: "^[CDHS](?:[2-9]|10|J|Q|K|A)$"},message:"must match pattern \""+"^[CDHS](?:[2-9]|10|J|Q|K|A)$"+"\""};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
else {
const err13 = {instancePath:instancePath+"/received/" + i2,schemaPath:"#/$defs/Card/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
}
else {
const err14 = {instancePath:instancePath+"/received",schemaPath:"#/properties/received/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.history !== undefined){
let data6 = data.history;
if(Array.isArray(data6)){
if(data6.length > 13){
const err15 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/maxItems",keyword:"maxItems",params:{limit: 13},message:"must NOT have more than 13 items"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
const len3 = data6.length;
for(let i3=0; i3<len3; i3++){
if(!(validate25(data6[i3], {instancePath:instancePath+"/history/" + i3,parentData:data6,parentDataProperty:i3,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate25.errors : vErrors.concat(validate25.errors);
errors = vErrors.length;
}
}
}
else {
const err16 = {instancePath:instancePath+"/history",schemaPath:"#/properties/history/type",keyword:"type",params:{type: "array"},message:"must be array"};
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
const err17 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
validate176.errors = vErrors;
return errors === 0;
}
validate176.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateBillingPreviewRequest = validate179;
const schema111 = {"title":"BillingPreviewRequest","oneOf":[{"type":"object","properties":{"action":{"const":"select-plan"},"plan":{"$ref":"#/$defs/PaidPlan"}},"required":["action","plan"],"additionalProperties":false},{"type":"object","properties":{"action":{"enum":["cancel","resume"]}},"required":["action"],"additionalProperties":false}]};

function validate179(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate179.evaluated;
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
if(data.action === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.plan === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "action") || (key0 === "plan"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.action !== undefined){
if("select-plan" !== data.action){
const err3 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/0/properties/action/const",keyword:"const",params:{allowedValue: "select-plan"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.plan !== undefined){
let data1 = data.plan;
if(!(((data1 === "practice") || (data1 === "unlimited")) || (data1 === "family"))){
const err4 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
}
else {
const err5 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.action === undefined){
const err6 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key1 in data){
if(!(key1 === "action")){
const err7 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.action !== undefined){
let data2 = data.action;
if(!((data2 === "cancel") || (data2 === "resume"))){
const err8 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/1/properties/action/enum",keyword:"enum",params:{allowedValues: schema111.oneOf[1].properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
var _valid0 = _errs7 === errors;
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
}
if(!valid0){
const err10 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
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
validate179.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate179.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateBillingPreview = validate180;
const schema113 = {"title":"BillingPreview","type":"object","properties":{"previewId":{"type":"string","minLength":1,"maxLength":256},"action":{"enum":["select-plan","cancel","resume"]},"plan":{"$ref":"#/$defs/PaidPlan"},"effectiveAt":{"type":"string","minLength":1,"maxLength":256},"expiresAt":{"type":"string","minLength":1,"maxLength":256},"amountDueNow":{"type":"null"},"currency":{"type":"null"},"mode":{"const":"fixture"},"notice":{"type":"string","maxLength":2000}},"required":["previewId","action","plan","effectiveAt","expiresAt","amountDueNow","currency","mode","notice"],"additionalProperties":false};

function validate180(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate180.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.previewId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "previewId"},message:"must have required property '"+"previewId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.action === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.plan === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.effectiveAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "effectiveAt"},message:"must have required property '"+"effectiveAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.expiresAt === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.amountDueNow === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "amountDueNow"},message:"must have required property '"+"amountDueNow"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.currency === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "currency"},message:"must have required property '"+"currency"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.mode === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(data.notice === undefined){
const err8 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "notice"},message:"must have required property '"+"notice"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
for(const key0 in data){
if(!(func2.call(schema113.properties, key0))){
const err9 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.previewId !== undefined){
let data0 = data.previewId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err10 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data0) < 1){
const err11 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.action !== undefined){
let data1 = data.action;
if(!(((data1 === "select-plan") || (data1 === "cancel")) || (data1 === "resume"))){
const err13 = {instancePath:instancePath+"/action",schemaPath:"#/properties/action/enum",keyword:"enum",params:{allowedValues: schema113.properties.action.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.plan !== undefined){
let data2 = data.plan;
if(!(((data2 === "practice") || (data2 === "unlimited")) || (data2 === "family"))){
const err14 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.effectiveAt !== undefined){
let data3 = data.effectiveAt;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err15 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func3(data3) < 1){
const err16 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.expiresAt !== undefined){
let data4 = data.expiresAt;
if(typeof data4 === "string"){
if(func3(data4) > 256){
const err18 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func3(data4) < 1){
const err19 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data.amountDueNow !== undefined){
if(data.amountDueNow !== null){
const err21 = {instancePath:instancePath+"/amountDueNow",schemaPath:"#/properties/amountDueNow/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
if(data.currency !== undefined){
if(data.currency !== null){
const err22 = {instancePath:instancePath+"/currency",schemaPath:"#/properties/currency/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data.mode !== undefined){
if("fixture" !== data.mode){
const err23 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "fixture"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
}
if(data.notice !== undefined){
let data8 = data.notice;
if(typeof data8 === "string"){
if(func3(data8) > 2000){
const err24 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
}
else {
const err25 = {instancePath:instancePath+"/notice",schemaPath:"#/properties/notice/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
}
else {
const err26 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
validate180.errors = vErrors;
return errors === 0;
}
validate180.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateBillingConfirmRequest = validate181;
const schema115 = {"title":"BillingConfirmRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"previewId":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","previewId"],"additionalProperties":false};

function validate181(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate181.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.previewId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "previewId"},message:"must have required property '"+"previewId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "commandId") || (key0 === "previewId"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err3 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func3(data0) < 1){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.previewId !== undefined){
let data1 = data.previewId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err6 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(func3(data1) < 1){
const err7 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
else {
const err8 = {instancePath:instancePath+"/previewId",schemaPath:"#/properties/previewId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
}
else {
const err9 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
validate181.errors = vErrors;
return errors === 0;
}
validate181.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateBillingOperation = validate182;
const schema116 = {"title":"BillingOperation","type":"object","properties":{"operationId":{"type":"string","minLength":1,"maxLength":256},"status":{"enum":["confirmed","scheduled"]},"effectiveAt":{"type":"string","minLength":1,"maxLength":256},"plan":{"$ref":"#/$defs/PaidPlan"},"cancelAtPeriodEnd":{"type":"boolean"},"mode":{"const":"fixture"},"message":{"type":"string","maxLength":2000}},"required":["operationId","status","effectiveAt","plan","cancelAtPeriodEnd","mode","message"],"additionalProperties":false};

function validate182(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate182.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.operationId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operationId"},message:"must have required property '"+"operationId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.status === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.effectiveAt === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "effectiveAt"},message:"must have required property '"+"effectiveAt"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.plan === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.cancelAtPeriodEnd === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cancelAtPeriodEnd"},message:"must have required property '"+"cancelAtPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.mode === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.message === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "operationId") || (key0 === "status")) || (key0 === "effectiveAt")) || (key0 === "plan")) || (key0 === "cancelAtPeriodEnd")) || (key0 === "mode")) || (key0 === "message"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.operationId !== undefined){
let data0 = data.operationId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err8 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data0) < 1){
const err9 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.status !== undefined){
let data1 = data.status;
if(!((data1 === "confirmed") || (data1 === "scheduled"))){
const err11 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema116.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.effectiveAt !== undefined){
let data2 = data.effectiveAt;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err12 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func3(data2) < 1){
const err13 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err14 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.plan !== undefined){
let data3 = data.plan;
if(!(((data3 === "practice") || (data3 === "unlimited")) || (data3 === "family"))){
const err15 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.cancelAtPeriodEnd !== undefined){
if(typeof data.cancelAtPeriodEnd !== "boolean"){
const err16 = {instancePath:instancePath+"/cancelAtPeriodEnd",schemaPath:"#/properties/cancelAtPeriodEnd/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.mode !== undefined){
if("fixture" !== data.mode){
const err17 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "fixture"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.message !== undefined){
let data6 = data.message;
if(typeof data6 === "string"){
if(func3(data6) > 2000){
const err18 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
validate182.errors = vErrors;
return errors === 0;
}
validate182.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateFamilyMember = validate183;
const schema118 = {"title":"FamilyMember","type":"object","properties":{"assignmentId":{"type":"string","minLength":1,"maxLength":256},"playerId":{"type":"string","minLength":1,"maxLength":256},"displayName":{"type":"string","maxLength":2000},"seatClass":{"enum":["unlimited","limited"]},"status":{"enum":["active","held"]},"periodEnd":{"type":"string","minLength":1,"maxLength":256}},"required":["assignmentId","playerId","displayName","seatClass","status","periodEnd"],"additionalProperties":false};

function validate183(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate183.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.assignmentId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "assignmentId"},message:"must have required property '"+"assignmentId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.playerId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "playerId"},message:"must have required property '"+"playerId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.displayName === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.seatClass === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "seatClass"},message:"must have required property '"+"seatClass"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.status === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.periodEnd === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "periodEnd"},message:"must have required property '"+"periodEnd"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
for(const key0 in data){
if(!((((((key0 === "assignmentId") || (key0 === "playerId")) || (key0 === "displayName")) || (key0 === "seatClass")) || (key0 === "status")) || (key0 === "periodEnd"))){
const err6 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
if(data.assignmentId !== undefined){
let data0 = data.assignmentId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err7 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/properties/assignmentId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
if(func3(data0) < 1){
const err8 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/properties/assignmentId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
else {
const err9 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/properties/assignmentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.playerId !== undefined){
let data1 = data.playerId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err10 = {instancePath:instancePath+"/playerId",schemaPath:"#/properties/playerId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data1) < 1){
const err11 = {instancePath:instancePath+"/playerId",schemaPath:"#/properties/playerId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/playerId",schemaPath:"#/properties/playerId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.displayName !== undefined){
let data2 = data.displayName;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err13 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
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
const err14 = {instancePath:instancePath+"/displayName",schemaPath:"#/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.seatClass !== undefined){
let data3 = data.seatClass;
if(!((data3 === "unlimited") || (data3 === "limited"))){
const err15 = {instancePath:instancePath+"/seatClass",schemaPath:"#/properties/seatClass/enum",keyword:"enum",params:{allowedValues: schema118.properties.seatClass.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.status !== undefined){
let data4 = data.status;
if(!((data4 === "active") || (data4 === "held"))){
const err16 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema118.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.periodEnd !== undefined){
let data5 = data.periodEnd;
if(typeof data5 === "string"){
if(func3(data5) > 256){
const err17 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func3(data5) < 1){
const err18 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
validate183.errors = vErrors;
return errors === 0;
}
validate183.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateFamilyInvitation = validate184;
const schema119 = {"title":"FamilyInvitation","type":"object","properties":{"invitationId":{"type":"string","minLength":1,"maxLength":256},"inviteeId":{"type":"string","minLength":1,"maxLength":256},"seatClass":{"enum":["unlimited","limited"]},"expiresAt":{"type":"string","minLength":1,"maxLength":256},"token":{"type":"string","minLength":1,"maxLength":256}},"required":["invitationId","inviteeId","seatClass","expiresAt"],"additionalProperties":false};

function validate184(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate184.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.invitationId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "invitationId"},message:"must have required property '"+"invitationId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.inviteeId === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "inviteeId"},message:"must have required property '"+"inviteeId"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.seatClass === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "seatClass"},message:"must have required property '"+"seatClass"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.expiresAt === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
for(const key0 in data){
if(!(((((key0 === "invitationId") || (key0 === "inviteeId")) || (key0 === "seatClass")) || (key0 === "expiresAt")) || (key0 === "token"))){
const err4 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.invitationId !== undefined){
let data0 = data.invitationId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err5 = {instancePath:instancePath+"/invitationId",schemaPath:"#/properties/invitationId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(func3(data0) < 1){
const err6 = {instancePath:instancePath+"/invitationId",schemaPath:"#/properties/invitationId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/invitationId",schemaPath:"#/properties/invitationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.inviteeId !== undefined){
let data1 = data.inviteeId;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err8 = {instancePath:instancePath+"/inviteeId",schemaPath:"#/properties/inviteeId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data1) < 1){
const err9 = {instancePath:instancePath+"/inviteeId",schemaPath:"#/properties/inviteeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/inviteeId",schemaPath:"#/properties/inviteeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.seatClass !== undefined){
let data2 = data.seatClass;
if(!((data2 === "unlimited") || (data2 === "limited"))){
const err11 = {instancePath:instancePath+"/seatClass",schemaPath:"#/properties/seatClass/enum",keyword:"enum",params:{allowedValues: schema119.properties.seatClass.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.expiresAt !== undefined){
let data3 = data.expiresAt;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err12 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func3(data3) < 1){
const err13 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err14 = {instancePath:instancePath+"/expiresAt",schemaPath:"#/properties/expiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.token !== undefined){
let data4 = data.token;
if(typeof data4 === "string"){
if(func3(data4) > 256){
const err15 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(func3(data4) < 1){
const err16 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
else {
const err17 = {instancePath:instancePath+"/token",schemaPath:"#/properties/token/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
}
else {
const err18 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
validate184.errors = vErrors;
return errors === 0;
}
validate184.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateFamilyView = validate185;
const schema120 = {"title":"FamilyView","type":"object","properties":{"familyId":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"role":{"enum":["none","payer","member"]},"payer":{"anyOf":[{"type":"object","properties":{"playerId":{"type":"string","minLength":1,"maxLength":256},"displayName":{"type":"string","maxLength":2000}},"required":["playerId","displayName"],"additionalProperties":false},{"type":"null"}]},"members":{"type":"array","items":{"$ref":"#/$defs/FamilyMember"},"maxItems":5},"invitations":{"type":"array","items":{"$ref":"#/$defs/FamilyInvitation"},"maxItems":4},"periodEnd":{"anyOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"null"}]},"localMock":{"const":true}},"required":["familyId","role","payer","members","invitations","periodEnd","localMock"],"additionalProperties":false};

function validate185(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate185.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.familyId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "familyId"},message:"must have required property '"+"familyId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.role === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "role"},message:"must have required property '"+"role"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.payer === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "payer"},message:"must have required property '"+"payer"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.members === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "members"},message:"must have required property '"+"members"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.invitations === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "invitations"},message:"must have required property '"+"invitations"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.periodEnd === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "periodEnd"},message:"must have required property '"+"periodEnd"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.localMock === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "localMock"},message:"must have required property '"+"localMock"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "familyId") || (key0 === "role")) || (key0 === "payer")) || (key0 === "members")) || (key0 === "invitations")) || (key0 === "periodEnd")) || (key0 === "localMock"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.familyId !== undefined){
let data0 = data.familyId;
const _errs3 = errors;
let valid1 = false;
const _errs4 = errors;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err8 = {instancePath:instancePath+"/familyId",schemaPath:"#/properties/familyId/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data0) < 1){
const err9 = {instancePath:instancePath+"/familyId",schemaPath:"#/properties/familyId/anyOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/familyId",schemaPath:"#/properties/familyId/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
var _valid0 = _errs4 === errors;
valid1 = valid1 || _valid0;
const _errs6 = errors;
if(data0 !== null){
const err11 = {instancePath:instancePath+"/familyId",schemaPath:"#/properties/familyId/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
var _valid0 = _errs6 === errors;
valid1 = valid1 || _valid0;
if(!valid1){
const err12 = {instancePath:instancePath+"/familyId",schemaPath:"#/properties/familyId/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
else {
errors = _errs3;
if(vErrors !== null){
if(_errs3){
vErrors.length = _errs3;
}
else {
vErrors = null;
}
}
}
}
if(data.role !== undefined){
let data1 = data.role;
if(!(((data1 === "none") || (data1 === "payer")) || (data1 === "member"))){
const err13 = {instancePath:instancePath+"/role",schemaPath:"#/properties/role/enum",keyword:"enum",params:{allowedValues: schema120.properties.role.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.payer !== undefined){
let data2 = data.payer;
const _errs10 = errors;
let valid2 = false;
const _errs11 = errors;
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
if(data2.playerId === undefined){
const err14 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf/0/required",keyword:"required",params:{missingProperty: "playerId"},message:"must have required property '"+"playerId"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data2.displayName === undefined){
const err15 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf/0/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
for(const key1 in data2){
if(!((key1 === "playerId") || (key1 === "displayName"))){
const err16 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data2.playerId !== undefined){
let data3 = data2.playerId;
if(typeof data3 === "string"){
if(func3(data3) > 256){
const err17 = {instancePath:instancePath+"/payer/playerId",schemaPath:"#/properties/payer/anyOf/0/properties/playerId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
if(func3(data3) < 1){
const err18 = {instancePath:instancePath+"/payer/playerId",schemaPath:"#/properties/payer/anyOf/0/properties/playerId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/payer/playerId",schemaPath:"#/properties/payer/anyOf/0/properties/playerId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
if(data2.displayName !== undefined){
let data4 = data2.displayName;
if(typeof data4 === "string"){
if(func3(data4) > 2000){
const err20 = {instancePath:instancePath+"/payer/displayName",schemaPath:"#/properties/payer/anyOf/0/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
else {
const err21 = {instancePath:instancePath+"/payer/displayName",schemaPath:"#/properties/payer/anyOf/0/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
}
else {
const err22 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
var _valid1 = _errs11 === errors;
valid2 = valid2 || _valid1;
const _errs18 = errors;
if(data2 !== null){
const err23 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
var _valid1 = _errs18 === errors;
valid2 = valid2 || _valid1;
if(!valid2){
const err24 = {instancePath:instancePath+"/payer",schemaPath:"#/properties/payer/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
else {
errors = _errs10;
if(vErrors !== null){
if(_errs10){
vErrors.length = _errs10;
}
else {
vErrors = null;
}
}
}
}
if(data.members !== undefined){
let data5 = data.members;
if(Array.isArray(data5)){
if(data5.length > 5){
const err25 = {instancePath:instancePath+"/members",schemaPath:"#/properties/members/maxItems",keyword:"maxItems",params:{limit: 5},message:"must NOT have more than 5 items"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
const len0 = data5.length;
for(let i0=0; i0<len0; i0++){
let data6 = data5[i0];
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.assignmentId === undefined){
const err26 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "assignmentId"},message:"must have required property '"+"assignmentId"+"'"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(data6.playerId === undefined){
const err27 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "playerId"},message:"must have required property '"+"playerId"+"'"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
if(data6.displayName === undefined){
const err28 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
if(data6.seatClass === undefined){
const err29 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "seatClass"},message:"must have required property '"+"seatClass"+"'"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
if(data6.status === undefined){
const err30 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data6.periodEnd === undefined){
const err31 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/required",keyword:"required",params:{missingProperty: "periodEnd"},message:"must have required property '"+"periodEnd"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
for(const key2 in data6){
if(!((((((key2 === "assignmentId") || (key2 === "playerId")) || (key2 === "displayName")) || (key2 === "seatClass")) || (key2 === "status")) || (key2 === "periodEnd"))){
const err32 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data6.assignmentId !== undefined){
let data7 = data6.assignmentId;
if(typeof data7 === "string"){
if(func3(data7) > 256){
const err33 = {instancePath:instancePath+"/members/" + i0+"/assignmentId",schemaPath:"#/$defs/FamilyMember/properties/assignmentId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
if(func3(data7) < 1){
const err34 = {instancePath:instancePath+"/members/" + i0+"/assignmentId",schemaPath:"#/$defs/FamilyMember/properties/assignmentId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
else {
const err35 = {instancePath:instancePath+"/members/" + i0+"/assignmentId",schemaPath:"#/$defs/FamilyMember/properties/assignmentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data6.playerId !== undefined){
let data8 = data6.playerId;
if(typeof data8 === "string"){
if(func3(data8) > 256){
const err36 = {instancePath:instancePath+"/members/" + i0+"/playerId",schemaPath:"#/$defs/FamilyMember/properties/playerId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(func3(data8) < 1){
const err37 = {instancePath:instancePath+"/members/" + i0+"/playerId",schemaPath:"#/$defs/FamilyMember/properties/playerId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err38 = {instancePath:instancePath+"/members/" + i0+"/playerId",schemaPath:"#/$defs/FamilyMember/properties/playerId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data6.displayName !== undefined){
let data9 = data6.displayName;
if(typeof data9 === "string"){
if(func3(data9) > 2000){
const err39 = {instancePath:instancePath+"/members/" + i0+"/displayName",schemaPath:"#/$defs/FamilyMember/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
else {
const err40 = {instancePath:instancePath+"/members/" + i0+"/displayName",schemaPath:"#/$defs/FamilyMember/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
if(data6.seatClass !== undefined){
let data10 = data6.seatClass;
if(!((data10 === "unlimited") || (data10 === "limited"))){
const err41 = {instancePath:instancePath+"/members/" + i0+"/seatClass",schemaPath:"#/$defs/FamilyMember/properties/seatClass/enum",keyword:"enum",params:{allowedValues: schema118.properties.seatClass.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data6.status !== undefined){
let data11 = data6.status;
if(!((data11 === "active") || (data11 === "held"))){
const err42 = {instancePath:instancePath+"/members/" + i0+"/status",schemaPath:"#/$defs/FamilyMember/properties/status/enum",keyword:"enum",params:{allowedValues: schema118.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data6.periodEnd !== undefined){
let data12 = data6.periodEnd;
if(typeof data12 === "string"){
if(func3(data12) > 256){
const err43 = {instancePath:instancePath+"/members/" + i0+"/periodEnd",schemaPath:"#/$defs/FamilyMember/properties/periodEnd/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(func3(data12) < 1){
const err44 = {instancePath:instancePath+"/members/" + i0+"/periodEnd",schemaPath:"#/$defs/FamilyMember/properties/periodEnd/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/members/" + i0+"/periodEnd",schemaPath:"#/$defs/FamilyMember/properties/periodEnd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath:instancePath+"/members/" + i0,schemaPath:"#/$defs/FamilyMember/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
}
else {
const err47 = {instancePath:instancePath+"/members",schemaPath:"#/properties/members/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
}
if(data.invitations !== undefined){
let data13 = data.invitations;
if(Array.isArray(data13)){
if(data13.length > 4){
const err48 = {instancePath:instancePath+"/invitations",schemaPath:"#/properties/invitations/maxItems",keyword:"maxItems",params:{limit: 4},message:"must NOT have more than 4 items"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
const len1 = data13.length;
for(let i1=0; i1<len1; i1++){
let data14 = data13[i1];
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
if(data14.invitationId === undefined){
const err49 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/required",keyword:"required",params:{missingProperty: "invitationId"},message:"must have required property '"+"invitationId"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
if(data14.inviteeId === undefined){
const err50 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/required",keyword:"required",params:{missingProperty: "inviteeId"},message:"must have required property '"+"inviteeId"+"'"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if(data14.seatClass === undefined){
const err51 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/required",keyword:"required",params:{missingProperty: "seatClass"},message:"must have required property '"+"seatClass"+"'"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(data14.expiresAt === undefined){
const err52 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/required",keyword:"required",params:{missingProperty: "expiresAt"},message:"must have required property '"+"expiresAt"+"'"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
for(const key3 in data14){
if(!(((((key3 === "invitationId") || (key3 === "inviteeId")) || (key3 === "seatClass")) || (key3 === "expiresAt")) || (key3 === "token"))){
const err53 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data14.invitationId !== undefined){
let data15 = data14.invitationId;
if(typeof data15 === "string"){
if(func3(data15) > 256){
const err54 = {instancePath:instancePath+"/invitations/" + i1+"/invitationId",schemaPath:"#/$defs/FamilyInvitation/properties/invitationId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
if(func3(data15) < 1){
const err55 = {instancePath:instancePath+"/invitations/" + i1+"/invitationId",schemaPath:"#/$defs/FamilyInvitation/properties/invitationId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
else {
const err56 = {instancePath:instancePath+"/invitations/" + i1+"/invitationId",schemaPath:"#/$defs/FamilyInvitation/properties/invitationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
}
if(data14.inviteeId !== undefined){
let data16 = data14.inviteeId;
if(typeof data16 === "string"){
if(func3(data16) > 256){
const err57 = {instancePath:instancePath+"/invitations/" + i1+"/inviteeId",schemaPath:"#/$defs/FamilyInvitation/properties/inviteeId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(func3(data16) < 1){
const err58 = {instancePath:instancePath+"/invitations/" + i1+"/inviteeId",schemaPath:"#/$defs/FamilyInvitation/properties/inviteeId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
}
else {
const err59 = {instancePath:instancePath+"/invitations/" + i1+"/inviteeId",schemaPath:"#/$defs/FamilyInvitation/properties/inviteeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data14.seatClass !== undefined){
let data17 = data14.seatClass;
if(!((data17 === "unlimited") || (data17 === "limited"))){
const err60 = {instancePath:instancePath+"/invitations/" + i1+"/seatClass",schemaPath:"#/$defs/FamilyInvitation/properties/seatClass/enum",keyword:"enum",params:{allowedValues: schema119.properties.seatClass.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
}
if(data14.expiresAt !== undefined){
let data18 = data14.expiresAt;
if(typeof data18 === "string"){
if(func3(data18) > 256){
const err61 = {instancePath:instancePath+"/invitations/" + i1+"/expiresAt",schemaPath:"#/$defs/FamilyInvitation/properties/expiresAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
if(func3(data18) < 1){
const err62 = {instancePath:instancePath+"/invitations/" + i1+"/expiresAt",schemaPath:"#/$defs/FamilyInvitation/properties/expiresAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
}
else {
const err63 = {instancePath:instancePath+"/invitations/" + i1+"/expiresAt",schemaPath:"#/$defs/FamilyInvitation/properties/expiresAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
if(data14.token !== undefined){
let data19 = data14.token;
if(typeof data19 === "string"){
if(func3(data19) > 256){
const err64 = {instancePath:instancePath+"/invitations/" + i1+"/token",schemaPath:"#/$defs/FamilyInvitation/properties/token/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if(func3(data19) < 1){
const err65 = {instancePath:instancePath+"/invitations/" + i1+"/token",schemaPath:"#/$defs/FamilyInvitation/properties/token/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err65];
}
else {
vErrors.push(err65);
}
errors++;
}
}
else {
const err66 = {instancePath:instancePath+"/invitations/" + i1+"/token",schemaPath:"#/$defs/FamilyInvitation/properties/token/type",keyword:"type",params:{type: "string"},message:"must be string"};
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
const err67 = {instancePath:instancePath+"/invitations/" + i1,schemaPath:"#/$defs/FamilyInvitation/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/invitations",schemaPath:"#/properties/invitations/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.periodEnd !== undefined){
let data20 = data.periodEnd;
const _errs52 = errors;
let valid12 = false;
const _errs53 = errors;
if(typeof data20 === "string"){
if(func3(data20) > 256){
const err69 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/anyOf/0/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
if(func3(data20) < 1){
const err70 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/anyOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
}
else {
const err71 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/anyOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
var _valid2 = _errs53 === errors;
valid12 = valid12 || _valid2;
const _errs55 = errors;
if(data20 !== null){
const err72 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/anyOf/1/type",keyword:"type",params:{type: "null"},message:"must be null"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
var _valid2 = _errs55 === errors;
valid12 = valid12 || _valid2;
if(!valid12){
const err73 = {instancePath:instancePath+"/periodEnd",schemaPath:"#/properties/periodEnd/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
else {
errors = _errs52;
if(vErrors !== null){
if(_errs52){
vErrors.length = _errs52;
}
else {
vErrors = null;
}
}
}
}
if(data.localMock !== undefined){
if(true !== data.localMock){
const err74 = {instancePath:instancePath+"/localMock",schemaPath:"#/properties/localMock/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
}
}
else {
const err75 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
validate185.errors = vErrors;
return errors === 0;
}
validate185.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateFamilyCommand = validate186;
const schema123 = {"title":"FamilyCommand","oneOf":[{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"create"}},"required":["commandId","action"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"invite"},"inviteeId":{"type":"string","pattern":"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},"seatClass":{"enum":["unlimited","limited"]}},"required":["commandId","action","inviteeId","seatClass"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"accept"},"token":{"type":"string","minLength":1,"maxLength":256},"acknowledgeIndividualCoverage":{"type":"boolean"}},"required":["commandId","action","token","acknowledgeIndividualCoverage"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"revoke-invite"},"invitationId":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","action","invitationId"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"remove"},"assignmentId":{"type":"string","minLength":1,"maxLength":256}},"required":["commandId","action","assignmentId"],"additionalProperties":false},{"type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"action":{"const":"leave"}},"required":["commandId","action"],"additionalProperties":false}]};

function validate186(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate186.evaluated;
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
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.action === undefined){
const err1 = {instancePath,schemaPath:"#/oneOf/0/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "commandId") || (key0 === "action"))){
const err2 = {instancePath,schemaPath:"#/oneOf/0/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err3 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func3(data0) < 1){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/0/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.action !== undefined){
if("create" !== data.action){
const err6 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/0/properties/action/const",keyword:"const",params:{allowedValue: "create"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/oneOf/0/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs7 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err8 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(data.action === undefined){
const err9 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
if(data.inviteeId === undefined){
const err10 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "inviteeId"},message:"must have required property '"+"inviteeId"+"'"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(data.seatClass === undefined){
const err11 = {instancePath,schemaPath:"#/oneOf/1/required",keyword:"required",params:{missingProperty: "seatClass"},message:"must have required property '"+"seatClass"+"'"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
for(const key1 in data){
if(!((((key1 === "commandId") || (key1 === "action")) || (key1 === "inviteeId")) || (key1 === "seatClass"))){
const err12 = {instancePath,schemaPath:"#/oneOf/1/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.commandId !== undefined){
let data2 = data.commandId;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err13 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
if(func3(data2) < 1){
const err14 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
else {
const err15 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/1/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.action !== undefined){
if("invite" !== data.action){
const err16 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/1/properties/action/const",keyword:"const",params:{allowedValue: "invite"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.inviteeId !== undefined){
let data4 = data.inviteeId;
if(typeof data4 === "string"){
if(!pattern14.test(data4)){
const err17 = {instancePath:instancePath+"/inviteeId",schemaPath:"#/oneOf/1/properties/inviteeId/pattern",keyword:"pattern",params:{pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"},message:"must match pattern \""+"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"+"\""};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
else {
const err18 = {instancePath:instancePath+"/inviteeId",schemaPath:"#/oneOf/1/properties/inviteeId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
if(data.seatClass !== undefined){
let data5 = data.seatClass;
if(!((data5 === "unlimited") || (data5 === "limited"))){
const err19 = {instancePath:instancePath+"/seatClass",schemaPath:"#/oneOf/1/properties/seatClass/enum",keyword:"enum",params:{allowedValues: schema123.oneOf[1].properties.seatClass.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath,schemaPath:"#/oneOf/1/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
var _valid0 = _errs7 === errors;
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
const _errs16 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err21 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
if(data.action === undefined){
const err22 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
if(data.token === undefined){
const err23 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "token"},message:"must have required property '"+"token"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data.acknowledgeIndividualCoverage === undefined){
const err24 = {instancePath,schemaPath:"#/oneOf/2/required",keyword:"required",params:{missingProperty: "acknowledgeIndividualCoverage"},message:"must have required property '"+"acknowledgeIndividualCoverage"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key2 in data){
if(!((((key2 === "commandId") || (key2 === "action")) || (key2 === "token")) || (key2 === "acknowledgeIndividualCoverage"))){
const err25 = {instancePath,schemaPath:"#/oneOf/2/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data.commandId !== undefined){
let data6 = data.commandId;
if(typeof data6 === "string"){
if(func3(data6) > 256){
const err26 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/2/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
if(func3(data6) < 1){
const err27 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/2/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
else {
const err28 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/2/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
if(data.action !== undefined){
if("accept" !== data.action){
const err29 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/2/properties/action/const",keyword:"const",params:{allowedValue: "accept"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.token !== undefined){
let data8 = data.token;
if(typeof data8 === "string"){
if(func3(data8) > 256){
const err30 = {instancePath:instancePath+"/token",schemaPath:"#/oneOf/2/properties/token/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(func3(data8) < 1){
const err31 = {instancePath:instancePath+"/token",schemaPath:"#/oneOf/2/properties/token/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
}
else {
const err32 = {instancePath:instancePath+"/token",schemaPath:"#/oneOf/2/properties/token/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
}
if(data.acknowledgeIndividualCoverage !== undefined){
if(typeof data.acknowledgeIndividualCoverage !== "boolean"){
const err33 = {instancePath:instancePath+"/acknowledgeIndividualCoverage",schemaPath:"#/oneOf/2/properties/acknowledgeIndividualCoverage/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
}
else {
const err34 = {instancePath,schemaPath:"#/oneOf/2/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
var _valid0 = _errs16 === errors;
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
const _errs26 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err35 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
if(data.action === undefined){
const err36 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(data.invitationId === undefined){
const err37 = {instancePath,schemaPath:"#/oneOf/3/required",keyword:"required",params:{missingProperty: "invitationId"},message:"must have required property '"+"invitationId"+"'"};
if(vErrors === null){
vErrors = [err37];
}
else {
vErrors.push(err37);
}
errors++;
}
for(const key3 in data){
if(!(((key3 === "commandId") || (key3 === "action")) || (key3 === "invitationId"))){
const err38 = {instancePath,schemaPath:"#/oneOf/3/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
if(data.commandId !== undefined){
let data10 = data.commandId;
if(typeof data10 === "string"){
if(func3(data10) > 256){
const err39 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/3/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
if(func3(data10) < 1){
const err40 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/3/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
}
else {
const err41 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/3/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
}
if(data.action !== undefined){
if("revoke-invite" !== data.action){
const err42 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/3/properties/action/const",keyword:"const",params:{allowedValue: "revoke-invite"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
}
if(data.invitationId !== undefined){
let data12 = data.invitationId;
if(typeof data12 === "string"){
if(func3(data12) > 256){
const err43 = {instancePath:instancePath+"/invitationId",schemaPath:"#/oneOf/3/properties/invitationId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(func3(data12) < 1){
const err44 = {instancePath:instancePath+"/invitationId",schemaPath:"#/oneOf/3/properties/invitationId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
}
else {
const err45 = {instancePath:instancePath+"/invitationId",schemaPath:"#/oneOf/3/properties/invitationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
}
}
else {
const err46 = {instancePath,schemaPath:"#/oneOf/3/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
var _valid0 = _errs26 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 3];
}
else {
if(_valid0){
valid0 = true;
passing0 = 3;
if(props0 !== true){
props0 = true;
}
}
const _errs34 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err47 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(data.action === undefined){
const err48 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err48];
}
else {
vErrors.push(err48);
}
errors++;
}
if(data.assignmentId === undefined){
const err49 = {instancePath,schemaPath:"#/oneOf/4/required",keyword:"required",params:{missingProperty: "assignmentId"},message:"must have required property '"+"assignmentId"+"'"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
for(const key4 in data){
if(!(((key4 === "commandId") || (key4 === "action")) || (key4 === "assignmentId"))){
const err50 = {instancePath,schemaPath:"#/oneOf/4/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
}
if(data.commandId !== undefined){
let data13 = data.commandId;
if(typeof data13 === "string"){
if(func3(data13) > 256){
const err51 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/4/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
if(func3(data13) < 1){
const err52 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/4/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err53 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/4/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data.action !== undefined){
if("remove" !== data.action){
const err54 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/4/properties/action/const",keyword:"const",params:{allowedValue: "remove"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
}
if(data.assignmentId !== undefined){
let data15 = data.assignmentId;
if(typeof data15 === "string"){
if(func3(data15) > 256){
const err55 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/oneOf/4/properties/assignmentId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
if(func3(data15) < 1){
const err56 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/oneOf/4/properties/assignmentId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err57 = {instancePath:instancePath+"/assignmentId",schemaPath:"#/oneOf/4/properties/assignmentId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
}
}
else {
const err58 = {instancePath,schemaPath:"#/oneOf/4/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
var _valid0 = _errs34 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 4];
}
else {
if(_valid0){
valid0 = true;
passing0 = 4;
if(props0 !== true){
props0 = true;
}
}
const _errs42 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err59 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
if(data.action === undefined){
const err60 = {instancePath,schemaPath:"#/oneOf/5/required",keyword:"required",params:{missingProperty: "action"},message:"must have required property '"+"action"+"'"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
for(const key5 in data){
if(!((key5 === "commandId") || (key5 === "action"))){
const err61 = {instancePath,schemaPath:"#/oneOf/5/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
if(data.commandId !== undefined){
let data16 = data.commandId;
if(typeof data16 === "string"){
if(func3(data16) > 256){
const err62 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/5/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if(func3(data16) < 1){
const err63 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/5/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
else {
const err64 = {instancePath:instancePath+"/commandId",schemaPath:"#/oneOf/5/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
}
if(data.action !== undefined){
if("leave" !== data.action){
const err65 = {instancePath:instancePath+"/action",schemaPath:"#/oneOf/5/properties/action/const",keyword:"const",params:{allowedValue: "leave"},message:"must be equal to constant"};
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
const err66 = {instancePath,schemaPath:"#/oneOf/5/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err66];
}
else {
vErrors.push(err66);
}
errors++;
}
var _valid0 = _errs42 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 5];
}
else {
if(_valid0){
valid0 = true;
passing0 = 5;
if(props0 !== true){
props0 = true;
}
}
}
}
}
}
}
if(!valid0){
const err67 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
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
validate186.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate186.evaluated = {"dynamicProps":true,"dynamicItems":false};

export const validateAccountDeleteRequest = validate187;
const schema124 = {"title":"AccountDeleteRequest","type":"object","properties":{"commandId":{"type":"string","minLength":1,"maxLength":256},"confirmation":{"const":"DELETE LOCAL ACCOUNT"}},"required":["commandId","confirmation"],"additionalProperties":false};

function validate187(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate187.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.commandId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "commandId"},message:"must have required property '"+"commandId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.confirmation === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "confirmation"},message:"must have required property '"+"confirmation"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
for(const key0 in data){
if(!((key0 === "commandId") || (key0 === "confirmation"))){
const err2 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
if(data.commandId !== undefined){
let data0 = data.commandId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err3 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(func3(data0) < 1){
const err4 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
else {
const err5 = {instancePath:instancePath+"/commandId",schemaPath:"#/properties/commandId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.confirmation !== undefined){
if("DELETE LOCAL ACCOUNT" !== data.confirmation){
const err6 = {instancePath:instancePath+"/confirmation",schemaPath:"#/properties/confirmation/const",keyword:"const",params:{allowedValue: "DELETE LOCAL ACCOUNT"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
}
else {
const err7 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
validate187.errors = vErrors;
return errors === 0;
}
validate187.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateAccountDeleteView = validate188;
const schema125 = {"title":"AccountDeleteView","type":"object","properties":{"deleted":{"const":true},"mode":{"const":"local-test"},"message":{"type":"string","maxLength":2000}},"required":["deleted","mode","message"],"additionalProperties":false};

function validate188(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate188.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.deleted === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "deleted"},message:"must have required property '"+"deleted"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.mode === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.message === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
for(const key0 in data){
if(!(((key0 === "deleted") || (key0 === "mode")) || (key0 === "message"))){
const err3 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
if(data.deleted !== undefined){
if(true !== data.deleted){
const err4 = {instancePath:instancePath+"/deleted",schemaPath:"#/properties/deleted/const",keyword:"const",params:{allowedValue: true},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
}
if(data.mode !== undefined){
if("local-test" !== data.mode){
const err5 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "local-test"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
}
if(data.message !== undefined){
let data2 = data.message;
if(typeof data2 === "string"){
if(func3(data2) > 2000){
const err6 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
}
else {
const err7 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
}
else {
const err8 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
validate188.errors = vErrors;
return errors === 0;
}
validate188.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

export const validateExportView = validate189;
const schema126 = {"title":"ExportView","type":"object","properties":{"formatVersion":{"const":"local-export-1"},"exportedAt":{"type":"string","minLength":1,"maxLength":256},"mode":{"const":"local-test"},"player":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":256},"displayName":{"type":"string","maxLength":2000},"preferences":{"$ref":"#/$defs/Preferences"}},"required":["id","displayName","preferences"],"additionalProperties":false},"subscription":{"type":"object","properties":{"plan":{"$ref":"#/$defs/PaidPlan"},"cancelAtPeriodEnd":{"type":"boolean"},"currentPeriodEnd":{"type":"string","minLength":1,"maxLength":256}},"required":["plan","cancelAtPeriodEnd","currentPeriodEnd"],"additionalProperties":false},"games":{"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":256},"revision":{"type":"integer","minimum":0},"frames":{"type":"array","items":{"$ref":"#/$defs/ReviewFrame"},"maxItems":100000},"advice":{"type":"array","items":{"$ref":"#/$defs/AdviceView"},"maxItems":100000},"stats":{"$ref":"#/$defs/SessionStats"}},"required":["id","revision","frames","advice","stats"],"additionalProperties":false},"maxItems":100000},"coachedHands":{"type":"array","items":{"type":"object","properties":{"gameId":{"type":"string","minLength":1,"maxLength":256},"handNumber":{"type":"integer","minimum":1},"period":{"type":"string","minLength":1,"maxLength":256}},"required":["gameId","handNumber","period"],"additionalProperties":false},"maxItems":100000},"billing":{"type":"array","items":{"$ref":"#/$defs/BillingOperation"},"maxItems":100000}},"required":["formatVersion","exportedAt","mode","player","subscription","games","coachedHands","billing"],"additionalProperties":false};

function validate100(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate100.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.operationId === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "operationId"},message:"must have required property '"+"operationId"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.status === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "status"},message:"must have required property '"+"status"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.effectiveAt === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "effectiveAt"},message:"must have required property '"+"effectiveAt"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.plan === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.cancelAtPeriodEnd === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "cancelAtPeriodEnd"},message:"must have required property '"+"cancelAtPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.mode === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.message === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "message"},message:"must have required property '"+"message"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
for(const key0 in data){
if(!(((((((key0 === "operationId") || (key0 === "status")) || (key0 === "effectiveAt")) || (key0 === "plan")) || (key0 === "cancelAtPeriodEnd")) || (key0 === "mode")) || (key0 === "message"))){
const err7 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
}
if(data.operationId !== undefined){
let data0 = data.operationId;
if(typeof data0 === "string"){
if(func3(data0) > 256){
const err8 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
if(func3(data0) < 1){
const err9 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
else {
const err10 = {instancePath:instancePath+"/operationId",schemaPath:"#/properties/operationId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
}
if(data.status !== undefined){
let data1 = data.status;
if(!((data1 === "confirmed") || (data1 === "scheduled"))){
const err11 = {instancePath:instancePath+"/status",schemaPath:"#/properties/status/enum",keyword:"enum",params:{allowedValues: schema116.properties.status.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
if(data.effectiveAt !== undefined){
let data2 = data.effectiveAt;
if(typeof data2 === "string"){
if(func3(data2) > 256){
const err12 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
if(func3(data2) < 1){
const err13 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err14 = {instancePath:instancePath+"/effectiveAt",schemaPath:"#/properties/effectiveAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
}
if(data.plan !== undefined){
let data3 = data.plan;
if(!(((data3 === "practice") || (data3 === "unlimited")) || (data3 === "family"))){
const err15 = {instancePath:instancePath+"/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
}
if(data.cancelAtPeriodEnd !== undefined){
if(typeof data.cancelAtPeriodEnd !== "boolean"){
const err16 = {instancePath:instancePath+"/cancelAtPeriodEnd",schemaPath:"#/properties/cancelAtPeriodEnd/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
}
if(data.mode !== undefined){
if("fixture" !== data.mode){
const err17 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "fixture"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data.message !== undefined){
let data6 = data.message;
if(typeof data6 === "string"){
if(func3(data6) > 2000){
const err18 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
}
else {
const err19 = {instancePath:instancePath+"/message",schemaPath:"#/properties/message/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
}
else {
const err20 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
validate100.errors = vErrors;
return errors === 0;
}
validate100.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate189(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate189.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(data && typeof data == "object" && !Array.isArray(data)){
if(data.formatVersion === undefined){
const err0 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "formatVersion"},message:"must have required property '"+"formatVersion"+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
if(data.exportedAt === undefined){
const err1 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "exportedAt"},message:"must have required property '"+"exportedAt"+"'"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
if(data.mode === undefined){
const err2 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "mode"},message:"must have required property '"+"mode"+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
if(data.player === undefined){
const err3 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "player"},message:"must have required property '"+"player"+"'"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
if(data.subscription === undefined){
const err4 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "subscription"},message:"must have required property '"+"subscription"+"'"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
if(data.games === undefined){
const err5 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "games"},message:"must have required property '"+"games"+"'"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
}
if(data.coachedHands === undefined){
const err6 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "coachedHands"},message:"must have required property '"+"coachedHands"+"'"};
if(vErrors === null){
vErrors = [err6];
}
else {
vErrors.push(err6);
}
errors++;
}
if(data.billing === undefined){
const err7 = {instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: "billing"},message:"must have required property '"+"billing"+"'"};
if(vErrors === null){
vErrors = [err7];
}
else {
vErrors.push(err7);
}
errors++;
}
for(const key0 in data){
if(!((((((((key0 === "formatVersion") || (key0 === "exportedAt")) || (key0 === "mode")) || (key0 === "player")) || (key0 === "subscription")) || (key0 === "games")) || (key0 === "coachedHands")) || (key0 === "billing"))){
const err8 = {instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err8];
}
else {
vErrors.push(err8);
}
errors++;
}
}
if(data.formatVersion !== undefined){
if("local-export-1" !== data.formatVersion){
const err9 = {instancePath:instancePath+"/formatVersion",schemaPath:"#/properties/formatVersion/const",keyword:"const",params:{allowedValue: "local-export-1"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err9];
}
else {
vErrors.push(err9);
}
errors++;
}
}
if(data.exportedAt !== undefined){
let data1 = data.exportedAt;
if(typeof data1 === "string"){
if(func3(data1) > 256){
const err10 = {instancePath:instancePath+"/exportedAt",schemaPath:"#/properties/exportedAt/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err10];
}
else {
vErrors.push(err10);
}
errors++;
}
if(func3(data1) < 1){
const err11 = {instancePath:instancePath+"/exportedAt",schemaPath:"#/properties/exportedAt/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err11];
}
else {
vErrors.push(err11);
}
errors++;
}
}
else {
const err12 = {instancePath:instancePath+"/exportedAt",schemaPath:"#/properties/exportedAt/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err12];
}
else {
vErrors.push(err12);
}
errors++;
}
}
if(data.mode !== undefined){
if("local-test" !== data.mode){
const err13 = {instancePath:instancePath+"/mode",schemaPath:"#/properties/mode/const",keyword:"const",params:{allowedValue: "local-test"},message:"must be equal to constant"};
if(vErrors === null){
vErrors = [err13];
}
else {
vErrors.push(err13);
}
errors++;
}
}
if(data.player !== undefined){
let data3 = data.player;
if(data3 && typeof data3 == "object" && !Array.isArray(data3)){
if(data3.id === undefined){
const err14 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err14];
}
else {
vErrors.push(err14);
}
errors++;
}
if(data3.displayName === undefined){
const err15 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/required",keyword:"required",params:{missingProperty: "displayName"},message:"must have required property '"+"displayName"+"'"};
if(vErrors === null){
vErrors = [err15];
}
else {
vErrors.push(err15);
}
errors++;
}
if(data3.preferences === undefined){
const err16 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/required",keyword:"required",params:{missingProperty: "preferences"},message:"must have required property '"+"preferences"+"'"};
if(vErrors === null){
vErrors = [err16];
}
else {
vErrors.push(err16);
}
errors++;
}
for(const key1 in data3){
if(!(((key1 === "id") || (key1 === "displayName")) || (key1 === "preferences"))){
const err17 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err17];
}
else {
vErrors.push(err17);
}
errors++;
}
}
if(data3.id !== undefined){
let data4 = data3.id;
if(typeof data4 === "string"){
if(func3(data4) > 256){
const err18 = {instancePath:instancePath+"/player/id",schemaPath:"#/properties/player/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err18];
}
else {
vErrors.push(err18);
}
errors++;
}
if(func3(data4) < 1){
const err19 = {instancePath:instancePath+"/player/id",schemaPath:"#/properties/player/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err19];
}
else {
vErrors.push(err19);
}
errors++;
}
}
else {
const err20 = {instancePath:instancePath+"/player/id",schemaPath:"#/properties/player/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err20];
}
else {
vErrors.push(err20);
}
errors++;
}
}
if(data3.displayName !== undefined){
let data5 = data3.displayName;
if(typeof data5 === "string"){
if(func3(data5) > 2000){
const err21 = {instancePath:instancePath+"/player/displayName",schemaPath:"#/properties/player/properties/displayName/maxLength",keyword:"maxLength",params:{limit: 2000},message:"must NOT have more than 2000 characters"};
if(vErrors === null){
vErrors = [err21];
}
else {
vErrors.push(err21);
}
errors++;
}
}
else {
const err22 = {instancePath:instancePath+"/player/displayName",schemaPath:"#/properties/player/properties/displayName/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err22];
}
else {
vErrors.push(err22);
}
errors++;
}
}
if(data3.preferences !== undefined){
let data6 = data3.preferences;
if(data6 && typeof data6 == "object" && !Array.isArray(data6)){
if(data6.coachMode === undefined){
const err23 = {instancePath:instancePath+"/player/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "coachMode"},message:"must have required property '"+"coachMode"+"'"};
if(vErrors === null){
vErrors = [err23];
}
else {
vErrors.push(err23);
}
errors++;
}
if(data6.gameSpeed === undefined){
const err24 = {instancePath:instancePath+"/player/preferences",schemaPath:"#/$defs/Preferences/required",keyword:"required",params:{missingProperty: "gameSpeed"},message:"must have required property '"+"gameSpeed"+"'"};
if(vErrors === null){
vErrors = [err24];
}
else {
vErrors.push(err24);
}
errors++;
}
for(const key2 in data6){
if(!((key2 === "coachMode") || (key2 === "gameSpeed"))){
const err25 = {instancePath:instancePath+"/player/preferences",schemaPath:"#/$defs/Preferences/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err25];
}
else {
vErrors.push(err25);
}
errors++;
}
}
if(data6.coachMode !== undefined){
let data7 = data6.coachMode;
if(!(((data7 === "asked") || (data7 === "nudges")) || (data7 === "after"))){
const err26 = {instancePath:instancePath+"/player/preferences/coachMode",schemaPath:"#/$defs/Preferences/properties/coachMode/enum",keyword:"enum",params:{allowedValues: schema56.properties.coachMode.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err26];
}
else {
vErrors.push(err26);
}
errors++;
}
}
if(data6.gameSpeed !== undefined){
let data8 = data6.gameSpeed;
if(!(((data8 === 1) || (data8 === 1.2)) || (data8 === 1.4))){
const err27 = {instancePath:instancePath+"/player/preferences/gameSpeed",schemaPath:"#/$defs/Preferences/properties/gameSpeed/enum",keyword:"enum",params:{allowedValues: schema56.properties.gameSpeed.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err27];
}
else {
vErrors.push(err27);
}
errors++;
}
}
}
else {
const err28 = {instancePath:instancePath+"/player/preferences",schemaPath:"#/$defs/Preferences/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err28];
}
else {
vErrors.push(err28);
}
errors++;
}
}
}
else {
const err29 = {instancePath:instancePath+"/player",schemaPath:"#/properties/player/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err29];
}
else {
vErrors.push(err29);
}
errors++;
}
}
if(data.subscription !== undefined){
let data9 = data.subscription;
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
if(data9.plan === undefined){
const err30 = {instancePath:instancePath+"/subscription",schemaPath:"#/properties/subscription/required",keyword:"required",params:{missingProperty: "plan"},message:"must have required property '"+"plan"+"'"};
if(vErrors === null){
vErrors = [err30];
}
else {
vErrors.push(err30);
}
errors++;
}
if(data9.cancelAtPeriodEnd === undefined){
const err31 = {instancePath:instancePath+"/subscription",schemaPath:"#/properties/subscription/required",keyword:"required",params:{missingProperty: "cancelAtPeriodEnd"},message:"must have required property '"+"cancelAtPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err31];
}
else {
vErrors.push(err31);
}
errors++;
}
if(data9.currentPeriodEnd === undefined){
const err32 = {instancePath:instancePath+"/subscription",schemaPath:"#/properties/subscription/required",keyword:"required",params:{missingProperty: "currentPeriodEnd"},message:"must have required property '"+"currentPeriodEnd"+"'"};
if(vErrors === null){
vErrors = [err32];
}
else {
vErrors.push(err32);
}
errors++;
}
for(const key3 in data9){
if(!(((key3 === "plan") || (key3 === "cancelAtPeriodEnd")) || (key3 === "currentPeriodEnd"))){
const err33 = {instancePath:instancePath+"/subscription",schemaPath:"#/properties/subscription/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key3},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err33];
}
else {
vErrors.push(err33);
}
errors++;
}
}
if(data9.plan !== undefined){
let data10 = data9.plan;
if(!(((data10 === "practice") || (data10 === "unlimited")) || (data10 === "family"))){
const err34 = {instancePath:instancePath+"/subscription/plan",schemaPath:"#/$defs/PaidPlan/enum",keyword:"enum",params:{allowedValues: schema58.enum},message:"must be equal to one of the allowed values"};
if(vErrors === null){
vErrors = [err34];
}
else {
vErrors.push(err34);
}
errors++;
}
}
if(data9.cancelAtPeriodEnd !== undefined){
if(typeof data9.cancelAtPeriodEnd !== "boolean"){
const err35 = {instancePath:instancePath+"/subscription/cancelAtPeriodEnd",schemaPath:"#/properties/subscription/properties/cancelAtPeriodEnd/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err35];
}
else {
vErrors.push(err35);
}
errors++;
}
}
if(data9.currentPeriodEnd !== undefined){
let data12 = data9.currentPeriodEnd;
if(typeof data12 === "string"){
if(func3(data12) > 256){
const err36 = {instancePath:instancePath+"/subscription/currentPeriodEnd",schemaPath:"#/properties/subscription/properties/currentPeriodEnd/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err36];
}
else {
vErrors.push(err36);
}
errors++;
}
if(func3(data12) < 1){
const err37 = {instancePath:instancePath+"/subscription/currentPeriodEnd",schemaPath:"#/properties/subscription/properties/currentPeriodEnd/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err38 = {instancePath:instancePath+"/subscription/currentPeriodEnd",schemaPath:"#/properties/subscription/properties/currentPeriodEnd/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err38];
}
else {
vErrors.push(err38);
}
errors++;
}
}
}
else {
const err39 = {instancePath:instancePath+"/subscription",schemaPath:"#/properties/subscription/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err39];
}
else {
vErrors.push(err39);
}
errors++;
}
}
if(data.games !== undefined){
let data13 = data.games;
if(Array.isArray(data13)){
if(data13.length > 100000){
const err40 = {instancePath:instancePath+"/games",schemaPath:"#/properties/games/maxItems",keyword:"maxItems",params:{limit: 100000},message:"must NOT have more than 100000 items"};
if(vErrors === null){
vErrors = [err40];
}
else {
vErrors.push(err40);
}
errors++;
}
const len0 = data13.length;
for(let i0=0; i0<len0; i0++){
let data14 = data13[i0];
if(data14 && typeof data14 == "object" && !Array.isArray(data14)){
if(data14.id === undefined){
const err41 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/required",keyword:"required",params:{missingProperty: "id"},message:"must have required property '"+"id"+"'"};
if(vErrors === null){
vErrors = [err41];
}
else {
vErrors.push(err41);
}
errors++;
}
if(data14.revision === undefined){
const err42 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/required",keyword:"required",params:{missingProperty: "revision"},message:"must have required property '"+"revision"+"'"};
if(vErrors === null){
vErrors = [err42];
}
else {
vErrors.push(err42);
}
errors++;
}
if(data14.frames === undefined){
const err43 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/required",keyword:"required",params:{missingProperty: "frames"},message:"must have required property '"+"frames"+"'"};
if(vErrors === null){
vErrors = [err43];
}
else {
vErrors.push(err43);
}
errors++;
}
if(data14.advice === undefined){
const err44 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/required",keyword:"required",params:{missingProperty: "advice"},message:"must have required property '"+"advice"+"'"};
if(vErrors === null){
vErrors = [err44];
}
else {
vErrors.push(err44);
}
errors++;
}
if(data14.stats === undefined){
const err45 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/required",keyword:"required",params:{missingProperty: "stats"},message:"must have required property '"+"stats"+"'"};
if(vErrors === null){
vErrors = [err45];
}
else {
vErrors.push(err45);
}
errors++;
}
for(const key4 in data14){
if(!(((((key4 === "id") || (key4 === "revision")) || (key4 === "frames")) || (key4 === "advice")) || (key4 === "stats"))){
const err46 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key4},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err46];
}
else {
vErrors.push(err46);
}
errors++;
}
}
if(data14.id !== undefined){
let data15 = data14.id;
if(typeof data15 === "string"){
if(func3(data15) > 256){
const err47 = {instancePath:instancePath+"/games/" + i0+"/id",schemaPath:"#/properties/games/items/properties/id/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err47];
}
else {
vErrors.push(err47);
}
errors++;
}
if(func3(data15) < 1){
const err48 = {instancePath:instancePath+"/games/" + i0+"/id",schemaPath:"#/properties/games/items/properties/id/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
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
const err49 = {instancePath:instancePath+"/games/" + i0+"/id",schemaPath:"#/properties/games/items/properties/id/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err49];
}
else {
vErrors.push(err49);
}
errors++;
}
}
if(data14.revision !== undefined){
let data16 = data14.revision;
if(!(((typeof data16 == "number") && (!(data16 % 1) && !isNaN(data16))) && (isFinite(data16)))){
const err50 = {instancePath:instancePath+"/games/" + i0+"/revision",schemaPath:"#/properties/games/items/properties/revision/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err50];
}
else {
vErrors.push(err50);
}
errors++;
}
if((typeof data16 == "number") && (isFinite(data16))){
if(data16 < 0 || isNaN(data16)){
const err51 = {instancePath:instancePath+"/games/" + i0+"/revision",schemaPath:"#/properties/games/items/properties/revision/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err51];
}
else {
vErrors.push(err51);
}
errors++;
}
}
}
if(data14.frames !== undefined){
let data17 = data14.frames;
if(Array.isArray(data17)){
if(data17.length > 100000){
const err52 = {instancePath:instancePath+"/games/" + i0+"/frames",schemaPath:"#/properties/games/items/properties/frames/maxItems",keyword:"maxItems",params:{limit: 100000},message:"must NOT have more than 100000 items"};
if(vErrors === null){
vErrors = [err52];
}
else {
vErrors.push(err52);
}
errors++;
}
const len1 = data17.length;
for(let i1=0; i1<len1; i1++){
if(!(validate55(data17[i1], {instancePath:instancePath+"/games/" + i0+"/frames/" + i1,parentData:data17,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate55.errors : vErrors.concat(validate55.errors);
errors = vErrors.length;
}
}
}
else {
const err53 = {instancePath:instancePath+"/games/" + i0+"/frames",schemaPath:"#/properties/games/items/properties/frames/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err53];
}
else {
vErrors.push(err53);
}
errors++;
}
}
if(data14.advice !== undefined){
let data19 = data14.advice;
if(Array.isArray(data19)){
if(data19.length > 100000){
const err54 = {instancePath:instancePath+"/games/" + i0+"/advice",schemaPath:"#/properties/games/items/properties/advice/maxItems",keyword:"maxItems",params:{limit: 100000},message:"must NOT have more than 100000 items"};
if(vErrors === null){
vErrors = [err54];
}
else {
vErrors.push(err54);
}
errors++;
}
const len2 = data19.length;
for(let i2=0; i2<len2; i2++){
if(!(validate42(data19[i2], {instancePath:instancePath+"/games/" + i0+"/advice/" + i2,parentData:data19,parentDataProperty:i2,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate42.errors : vErrors.concat(validate42.errors);
errors = vErrors.length;
}
}
}
else {
const err55 = {instancePath:instancePath+"/games/" + i0+"/advice",schemaPath:"#/properties/games/items/properties/advice/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err55];
}
else {
vErrors.push(err55);
}
errors++;
}
}
if(data14.stats !== undefined){
let data21 = data14.stats;
if(data21 && typeof data21 == "object" && !Array.isArray(data21)){
if(data21.decisions === undefined){
const err56 = {instancePath:instancePath+"/games/" + i0+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "decisions"},message:"must have required property '"+"decisions"+"'"};
if(vErrors === null){
vErrors = [err56];
}
else {
vErrors.push(err56);
}
errors++;
}
if(data21.helped === undefined){
const err57 = {instancePath:instancePath+"/games/" + i0+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "helped"},message:"must have required property '"+"helped"+"'"};
if(vErrors === null){
vErrors = [err57];
}
else {
vErrors.push(err57);
}
errors++;
}
if(data21.suggestions === undefined){
const err58 = {instancePath:instancePath+"/games/" + i0+"/stats",schemaPath:"#/$defs/SessionStats/required",keyword:"required",params:{missingProperty: "suggestions"},message:"must have required property '"+"suggestions"+"'"};
if(vErrors === null){
vErrors = [err58];
}
else {
vErrors.push(err58);
}
errors++;
}
for(const key5 in data21){
if(!(((key5 === "decisions") || (key5 === "helped")) || (key5 === "suggestions"))){
const err59 = {instancePath:instancePath+"/games/" + i0+"/stats",schemaPath:"#/$defs/SessionStats/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key5},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err59];
}
else {
vErrors.push(err59);
}
errors++;
}
}
if(data21.decisions !== undefined){
let data22 = data21.decisions;
if(!(((typeof data22 == "number") && (!(data22 % 1) && !isNaN(data22))) && (isFinite(data22)))){
const err60 = {instancePath:instancePath+"/games/" + i0+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err60];
}
else {
vErrors.push(err60);
}
errors++;
}
if((typeof data22 == "number") && (isFinite(data22))){
if(data22 < 0 || isNaN(data22)){
const err61 = {instancePath:instancePath+"/games/" + i0+"/stats/decisions",schemaPath:"#/$defs/SessionStats/properties/decisions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err61];
}
else {
vErrors.push(err61);
}
errors++;
}
}
}
if(data21.helped !== undefined){
let data23 = data21.helped;
if(!(((typeof data23 == "number") && (!(data23 % 1) && !isNaN(data23))) && (isFinite(data23)))){
const err62 = {instancePath:instancePath+"/games/" + i0+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err62];
}
else {
vErrors.push(err62);
}
errors++;
}
if((typeof data23 == "number") && (isFinite(data23))){
if(data23 < 0 || isNaN(data23)){
const err63 = {instancePath:instancePath+"/games/" + i0+"/stats/helped",schemaPath:"#/$defs/SessionStats/properties/helped/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
if(vErrors === null){
vErrors = [err63];
}
else {
vErrors.push(err63);
}
errors++;
}
}
}
if(data21.suggestions !== undefined){
let data24 = data21.suggestions;
if(!(((typeof data24 == "number") && (!(data24 % 1) && !isNaN(data24))) && (isFinite(data24)))){
const err64 = {instancePath:instancePath+"/games/" + i0+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err64];
}
else {
vErrors.push(err64);
}
errors++;
}
if((typeof data24 == "number") && (isFinite(data24))){
if(data24 < 0 || isNaN(data24)){
const err65 = {instancePath:instancePath+"/games/" + i0+"/stats/suggestions",schemaPath:"#/$defs/SessionStats/properties/suggestions/minimum",keyword:"minimum",params:{comparison: ">=", limit: 0},message:"must be >= 0"};
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
}
else {
const err66 = {instancePath:instancePath+"/games/" + i0+"/stats",schemaPath:"#/$defs/SessionStats/type",keyword:"type",params:{type: "object"},message:"must be object"};
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
const err67 = {instancePath:instancePath+"/games/" + i0,schemaPath:"#/properties/games/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err67];
}
else {
vErrors.push(err67);
}
errors++;
}
}
}
else {
const err68 = {instancePath:instancePath+"/games",schemaPath:"#/properties/games/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err68];
}
else {
vErrors.push(err68);
}
errors++;
}
}
if(data.coachedHands !== undefined){
let data25 = data.coachedHands;
if(Array.isArray(data25)){
if(data25.length > 100000){
const err69 = {instancePath:instancePath+"/coachedHands",schemaPath:"#/properties/coachedHands/maxItems",keyword:"maxItems",params:{limit: 100000},message:"must NOT have more than 100000 items"};
if(vErrors === null){
vErrors = [err69];
}
else {
vErrors.push(err69);
}
errors++;
}
const len3 = data25.length;
for(let i3=0; i3<len3; i3++){
let data26 = data25[i3];
if(data26 && typeof data26 == "object" && !Array.isArray(data26)){
if(data26.gameId === undefined){
const err70 = {instancePath:instancePath+"/coachedHands/" + i3,schemaPath:"#/properties/coachedHands/items/required",keyword:"required",params:{missingProperty: "gameId"},message:"must have required property '"+"gameId"+"'"};
if(vErrors === null){
vErrors = [err70];
}
else {
vErrors.push(err70);
}
errors++;
}
if(data26.handNumber === undefined){
const err71 = {instancePath:instancePath+"/coachedHands/" + i3,schemaPath:"#/properties/coachedHands/items/required",keyword:"required",params:{missingProperty: "handNumber"},message:"must have required property '"+"handNumber"+"'"};
if(vErrors === null){
vErrors = [err71];
}
else {
vErrors.push(err71);
}
errors++;
}
if(data26.period === undefined){
const err72 = {instancePath:instancePath+"/coachedHands/" + i3,schemaPath:"#/properties/coachedHands/items/required",keyword:"required",params:{missingProperty: "period"},message:"must have required property '"+"period"+"'"};
if(vErrors === null){
vErrors = [err72];
}
else {
vErrors.push(err72);
}
errors++;
}
for(const key6 in data26){
if(!(((key6 === "gameId") || (key6 === "handNumber")) || (key6 === "period"))){
const err73 = {instancePath:instancePath+"/coachedHands/" + i3,schemaPath:"#/properties/coachedHands/items/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key6},message:"must NOT have additional properties"};
if(vErrors === null){
vErrors = [err73];
}
else {
vErrors.push(err73);
}
errors++;
}
}
if(data26.gameId !== undefined){
let data27 = data26.gameId;
if(typeof data27 === "string"){
if(func3(data27) > 256){
const err74 = {instancePath:instancePath+"/coachedHands/" + i3+"/gameId",schemaPath:"#/properties/coachedHands/items/properties/gameId/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err74];
}
else {
vErrors.push(err74);
}
errors++;
}
if(func3(data27) < 1){
const err75 = {instancePath:instancePath+"/coachedHands/" + i3+"/gameId",schemaPath:"#/properties/coachedHands/items/properties/gameId/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err75];
}
else {
vErrors.push(err75);
}
errors++;
}
}
else {
const err76 = {instancePath:instancePath+"/coachedHands/" + i3+"/gameId",schemaPath:"#/properties/coachedHands/items/properties/gameId/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err76];
}
else {
vErrors.push(err76);
}
errors++;
}
}
if(data26.handNumber !== undefined){
let data28 = data26.handNumber;
if(!(((typeof data28 == "number") && (!(data28 % 1) && !isNaN(data28))) && (isFinite(data28)))){
const err77 = {instancePath:instancePath+"/coachedHands/" + i3+"/handNumber",schemaPath:"#/properties/coachedHands/items/properties/handNumber/type",keyword:"type",params:{type: "integer"},message:"must be integer"};
if(vErrors === null){
vErrors = [err77];
}
else {
vErrors.push(err77);
}
errors++;
}
if((typeof data28 == "number") && (isFinite(data28))){
if(data28 < 1 || isNaN(data28)){
const err78 = {instancePath:instancePath+"/coachedHands/" + i3+"/handNumber",schemaPath:"#/properties/coachedHands/items/properties/handNumber/minimum",keyword:"minimum",params:{comparison: ">=", limit: 1},message:"must be >= 1"};
if(vErrors === null){
vErrors = [err78];
}
else {
vErrors.push(err78);
}
errors++;
}
}
}
if(data26.period !== undefined){
let data29 = data26.period;
if(typeof data29 === "string"){
if(func3(data29) > 256){
const err79 = {instancePath:instancePath+"/coachedHands/" + i3+"/period",schemaPath:"#/properties/coachedHands/items/properties/period/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err79];
}
else {
vErrors.push(err79);
}
errors++;
}
if(func3(data29) < 1){
const err80 = {instancePath:instancePath+"/coachedHands/" + i3+"/period",schemaPath:"#/properties/coachedHands/items/properties/period/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err80];
}
else {
vErrors.push(err80);
}
errors++;
}
}
else {
const err81 = {instancePath:instancePath+"/coachedHands/" + i3+"/period",schemaPath:"#/properties/coachedHands/items/properties/period/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err81];
}
else {
vErrors.push(err81);
}
errors++;
}
}
}
else {
const err82 = {instancePath:instancePath+"/coachedHands/" + i3,schemaPath:"#/properties/coachedHands/items/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err82];
}
else {
vErrors.push(err82);
}
errors++;
}
}
}
else {
const err83 = {instancePath:instancePath+"/coachedHands",schemaPath:"#/properties/coachedHands/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err83];
}
else {
vErrors.push(err83);
}
errors++;
}
}
if(data.billing !== undefined){
let data30 = data.billing;
if(Array.isArray(data30)){
if(data30.length > 100000){
const err84 = {instancePath:instancePath+"/billing",schemaPath:"#/properties/billing/maxItems",keyword:"maxItems",params:{limit: 100000},message:"must NOT have more than 100000 items"};
if(vErrors === null){
vErrors = [err84];
}
else {
vErrors.push(err84);
}
errors++;
}
const len4 = data30.length;
for(let i4=0; i4<len4; i4++){
if(!(validate100(data30[i4], {instancePath:instancePath+"/billing/" + i4,parentData:data30,parentDataProperty:i4,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate100.errors : vErrors.concat(validate100.errors);
errors = vErrors.length;
}
}
}
else {
const err85 = {instancePath:instancePath+"/billing",schemaPath:"#/properties/billing/type",keyword:"type",params:{type: "array"},message:"must be array"};
if(vErrors === null){
vErrors = [err85];
}
else {
vErrors.push(err85);
}
errors++;
}
}
}
else {
const err86 = {instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"};
if(vErrors === null){
vErrors = [err86];
}
else {
vErrors.push(err86);
}
errors++;
}
validate189.errors = vErrors;
return errors === 0;
}
validate189.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
