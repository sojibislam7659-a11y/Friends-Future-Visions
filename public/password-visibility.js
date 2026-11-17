(()=>{"use strict";
const eye='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
const eyeOff='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a15 15 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4-.8"/></svg>';
function enhance(root){
 const nodes=[];
 if(root instanceof Element&&root.matches('input[type="password"]'))nodes.push(root);
 if(root.querySelectorAll)nodes.push(...root.querySelectorAll('input[type="password"]'));
 for(const input of nodes){
  if(input.dataset.passwordToggleReady==="1")continue;
  const wrapper=document.createElement("span");wrapper.className="password-field-wrap";
  input.parentNode.insertBefore(wrapper,input);wrapper.appendChild(input);
  const button=document.createElement("button");button.type="button";button.className="password-visibility-toggle";
  button.setAttribute("aria-label","Show password");button.setAttribute("aria-pressed","false");button.title="Show password";
  button.innerHTML=eye;
  button.addEventListener("click",()=>{
   const show=input.type==="password";input.type=show?"text":"password";
   button.innerHTML=show?eyeOff:eye;
   button.setAttribute("aria-label",show?"Hide password":"Show password");
   button.title=show?"Hide password":"Show password";
   button.setAttribute("aria-pressed",String(show));
  });
  wrapper.appendChild(button);input.dataset.passwordToggleReady="1";
 }
}
enhance(document);
const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)enhance(node)});
observer.observe(document.documentElement,{childList:true,subtree:true});
})();