function hideOtherViews(divId){
   if(divId == 'thumbnail') {
     if(document.getElementById("thumbnail").classList.contains("hidden")) {
        document.getElementById("thumbnail").classList.remove('hidden');
     }
     if(!document.getElementById("gallery").classList.contains("hidden")) {
        document.getElementById("gallery").classList.add('hidden');
     }
     if(!document.getElementById("list").classList.contains("hidden")) {
        document.getElementById("list").classList.add('hidden');
     }
    
   }

   if(divId == 'list') {
     if(document.getElementById("list").classList.contains("hidden")) {
        document.getElementById("list").classList.remove('hidden');
     }
     if(!document.getElementById("gallery").classList.contains("hidden")) {
        document.getElementById("gallery").classList.add('hidden');
     }
     if(!document.getElementById("thumbnail").classList.contains("hidden")) {
        document.getElementById("thumbnail").classList.add('hidden');
     }
   }

   if(divId == 'gallery') {
     if(document.getElementById("gallery").classList.contains("hidden")) {
        document.getElementById("gallery").classList.remove('hidden');
     }
     if(!document.getElementById("thumbnail").classList.contains("hidden")) {
        document.getElementById("thumbnail").classList.add('hidden');
     }
     if(!document.getElementById("list").classList.contains("hidden")) {
        document.getElementById("list").classList.add('hidden');
     }
   }


   
};
