$(document).ready(function(){
   var adChanged = false;
  
//   setInterval(rotateAd, 31000);
//   setInterval(resetAdVar, 10000);


});

function rotateAd() {

     if(!adChanged) {
        var adDiv = document.getElementById("insurance_ad");
        var divContents = adDiv.innerHTML;
     
        if (divContents.includes("B07KFPS51D")) { // Amazon Inverter
            adDiv.innerHTML = "<img src = \"https://cnrauto.herokuapp.com/state_farm_insurance_for_devin_159x114.gif\" width=\"159\" height = \"114\">";
             adChanged = true;
        }

        else if (divContents.includes("state_farm_insurance_for_devin")) {
            adDiv.innerHTML = "<a href=\"https://cnrauto.herokuapp.com/refer/insurance/able_auto_insurance/\"><img src = \"https://cnrauto.herokuapp.com/able_auto_insurance_for_rob_304x89.gif\" width=\"304\" height = \"89\"></a>";
             adChanged = true;
        }
        
        else if (divContents.includes("able_auto_insurance_for_rob")) {
            adDiv.innerHTML = "";

            var amazonScript1 = document.createElement('script');
            
            amazonScript1.text = "amzn_assoc_placement = \"adunit0\"; amzn_assoc_tracking_id = \"craniumware-20\"; amzn_assoc_ad_mode = \"manual\"; amzn_assoc_ad_type = \"smart\"; amzn_assoc_marketplace = \"amazon\"; amzn_assoc_region = \"US\"; amzn_assoc_linkid = \"b161ae94a26ab8bb808f1effbdea944b\"; amzn_assoc_asins = \"B07SH348D4,B07TJ51B6W,B07MZKQS5H,B07MT6175M,B07Z4SKX32\"; amzn_assoc_design = \"in_content\""; 

            
            

            adDiv.appendChild(amazonScript1);
            
            postscribe('#insurance_ad', '<script src="//z-na.amazon-adsystem.com/widgets/onejs?MarketPlace=US"></script>');


            adChanged = true;
        }

        else if (divContents.includes("B07SH348D4")) { // Amazon Valentine
            adDiv.innerHTML = "";

            var amazonScript1 = document.createElement('script');
            
            amazonScript1.text = "amzn_assoc_placement = \"adunit0\"; amzn_assoc_tracking_id = \"craniumware-20\"; amzn_assoc_ad_mode = \"manual\"; amzn_assoc_ad_type = \"smart\"; amzn_assoc_marketplace = \"amazon\"; amzn_assoc_region = \"US\"; amzn_assoc_linkid = \"b161ae94a26ab8bb808f1effbdea944b\"; amzn_assoc_asins = \"B07VMSK7RP,B07TK8X2KT,B07KFPS51D\"; amzn_assoc_design = \"in_content\""; 

            
            

            adDiv.appendChild(amazonScript1);
            
            postscribe('#insurance_ad', '<script src="//z-na.amazon-adsystem.com/widgets/onejs?MarketPlace=US"></script>');


            adChanged = true;
        }

     } // end if !adChanged
     
    
   }

   


   


   function resetAdVar() {
     adChanged = false;
 
   }

;
