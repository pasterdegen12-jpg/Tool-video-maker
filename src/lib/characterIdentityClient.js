export async function characterProjectRequest(getToken,projectId,input){
  const token=await getToken();if(!token)throw Error('Cần đăng nhập lại.');
  const response=await fetch('/api/local-ai/character-project/'+encodeURIComponent(projectId),{
    method:input?'POST':'GET',headers:{Authorization:'Bearer '+token,...(input?{'Content-Type':'application/json'}:{})},
    ...(input?{body:JSON.stringify(input)}:{}),credentials:'omit',redirect:'error',referrerPolicy:'same-origin',signal:AbortSignal.timeout(30000)});
  const value=await response.json();if(!response.ok)throw Error(value.error||'Không lưu được Character ID.');
  if(!value.project||!value.fingerprint)throw Error('Phản hồi lưu không hợp lệ.');return value;
}
