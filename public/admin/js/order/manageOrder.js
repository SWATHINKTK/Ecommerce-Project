

// ***** UPDATE STATUS OF THE ORDER IN ADMIN *****
const updateOrderStatus = document.querySelectorAll('button[name="updateOrderStatus"]');

updateOrderStatus.forEach((updateButton) => {
    updateButton.addEventListener('click', async(event)=>{

        const orderId = event.target.getAttribute('data-order-id');
        const productId = event.target.getAttribute('data-product-id');
        const productQty = event.target.getAttribute('data-product-quantity');

        const status = document.getElementById(`${productId}`);
        
        const headingStatusView = document.querySelector(`span[name='${productId}']`);


        if(status.value == ''){
            alert('Select the Status')
            return;
        }

        Swal.fire({
            title: "Do you want to Update the Status?",
            // showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: "Save",
            // denyButtonText: `Don't save`
          }).then(async (result) => {
        
            if (result.isConfirmed) {

                
                // console.log(status,status.value)
                
                const url = '/api/updateStatus';

                const responseOptions = {
                    method:'PATCH',
                    body:JSON.stringify({
                        orderId:orderId,
                        productId:productId,
                        productQty:productQty,
                        orderStatus:status.value
                    }),
                    headers:{'Content-Type':'application/json'}
                }

                const response = await fetch(url,responseOptions) ;

                headingStatusView.innerHTML = `( ${status.value} )`;
                
                if(status.value == 'Canceled'){

                    const updateStatusSection = document.querySelector(`div[name='${productId}']`);
                    updateStatusSection.style.display = 'none';
                    headingStatusView.setAttribute('class','ml-3 font-weight-bold text-danger');
                    

                }else{
                    headingStatusView.setAttribute('class','ml-3 font-weight-bold text-success');
                }

                Swal.fire("Saved!", "", "success");
            } 
          });

        
    })
})








// document.getElementById('manageOrder').addEventListener('click',async(event)=>{
//     event.preventDefault();
    
//     const eventTag = event.target;
//     if(event.target.name == 'manage'){
//         const url = eventTag.value;
        
//         const response = await fetch(url);

//         if(!response.ok){
//             window.location.href = '/admin/error500';
//         }

//         const responseData = await response.text();

//         const contentPlaceholder = document.getElementById("dynamic_page");

//         contentPlaceholder.innerHTML = responseData
//     }
    
// })