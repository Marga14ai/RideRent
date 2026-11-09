function isValidBirthday(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<=today;
}
module.exports={isValidBirthday};
