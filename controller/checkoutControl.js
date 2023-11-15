const addressData = require('../models/addressModel');
const {productInfo} = require('../models/productModel');
const {userData} = require('../models/userModal');
const orderData = require('../models/orderModel');
const cartData = require('../models/cartModel');
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');

// PAYMENT INTEGRATION KEY SETUP
var instance = new Razorpay({
    key_id: process.env.PAYMENT_INTEGRATION_KEY_ID,
    key_secret: process.env.PAYMENT_INTEGRATION_KEY_SECRET,
  });


const LoadCheckoutPage = async(req, res, next) => {

    try{

        const checkLogin = req.session.userId ? true : false;

        const userId = req.session.userId;
        const addressInfo = await addressData.find({userId:userId});

        if(req.query.single){

            const productId = req.query.id;

            const productData = await productInfo.findOne({_id:productId});
        
            res.render('user/checkout',{user:true, title:'CheckOut', login:checkLogin, address:addressInfo, product:productData ,single:true});

        }else{

            const cartProduct = await cartData.findOne({userId:userId}).populate('cartProducts.productId')
            const productData = cartProduct.cartProducts;
     
            res.render('user/checkout',{user:true, title:'CheckOut', login:checkLogin, address:addressInfo, cartProduct:productData ,single:false});
        }

    }catch(error){
        next(error)
    }

}




const PlaceOrder = async(req, res, next)=>{

    try {

        const userId = req.session.userId;
        
        const data = req.body;
    
        // **** Address Information Setting in the Order ****
        const addressInfo = await addressData.findOne({_id:data.Address});

        const address = {
            username:addressInfo.username,
            phonenumber:addressInfo.phoneNumber,
            pincode:addressInfo.pincode,
            locality:addressInfo.locality,
            address:addressInfo.address,
            city:addressInfo.city,
            district:addressInfo.district,
            landmark:addressInfo.landmark,
            alternateNumber:addressInfo.alternateNumber,
        }
        // **** End Of The Address Section *****

        

        // **** Product Data Storing Section Else Part Cart Order**** 
        let productData;
        let products;
        let totalPrice = 0;
        if(data.SingleProduct){

            productData = await productInfo.findOne({_id:data.ProductId});

            if(productData.stock >= data.productQuantity ){

                products = {
                    productId:data.ProductId,
                    productPrice:data.ProductPrice,
                    productTotalAmount:(data.productQuantity * data.ProductPrice),
                    productquantity:data.productQuantity
                }
                totalPrice = data.productQuantity * data.ProductPrice;

            }else{
                res.json({StockStatus:false, singleStock:false, quantity:productData.stock});
                return;
            }

        }else{

            
            const stockChecking = await checkStock(userId);

            if(stockChecking){

                const cartInfo = await cartData.findOne({userId:userId},{cartProducts:1});
                products = cartInfo.cartProducts.map(item => ({
                    productId: item.productId,
                    productPrice:item.price,
                    productTotalAmount: (item.price * item.quantity),
                    productquantity:item.quantity
                }));
                products.map((val) => {
                    totalPrice += val.productTotalAmount
                });

            }else{
                res.json({status:false, stock:false});
                return; 
            }        
        }
        // **** End Of The Product Data Storing *****


        // *** Payment Status Setting Section ****
        let paymentStatus;
        if(data.PaymentMethod == 'COD'){
            
            paymentStatus = 'Pending';

        }else if(data.PaymentMethod == 'Wallet'){

            const userWallet = await userData.findOne({_id:userId});

            if(userWallet.walletAmount < products.productTotalAmount){
                console.log('Wallet')
                res.json({walletInsufficient:true});
                return;
            }else{
                paymentStatus = 'Pending';
            }

        }else{

            paymentStatus = 'Processing';

        }
        // **** End Of the Payment Status Section ****



        // **** Order DataBase Store  Object Creation ****
        const orderSucess = orderData({
            addressInformation:address,
            productInforamtion:products,
            userId:userId,
            totalAmount:totalPrice,
            paymentMethod:data.PaymentMethod,
            paymentStatus:paymentStatus
        });

        const orderStore = await orderSucess.save();

        // **** Stock Management in Order The Product Else Part Cart Products ****
        if(orderStore && data.SingleProduct){
            const stockUpdate = await productInfo.updateOne({_id:data.ProductId},{$inc:{stock:-data.productQuantity}});
         
            if(stockUpdate){
                
                if(orderSucess.paymentMethod == 'COD'){
                    res.json({CODSuccess:true,orderId:orderSucess._id});
                }
                else if(orderSucess.paymentMethod == 'OnlinePayment'){

                    // RazorPay Options & CreateRazorPay Instance
                    var options = {
                        amount: orderSucess.totalAmount * 100 ,  // amount in the smallest currency unit
                        currency: "INR",
                        receipt: orderSucess._id
                      };
                      instance.orders.create(options, function(err, order) {
                            res.json({OnlinePayment:true,order:order})
                      });

                }else if(orderSucess.paymentMethod == 'Wallet'){
                    
                    const nanoidModule = await import('nanoid');
                    nanoid = nanoidModule.nanoid;

                    const uniqueID = nanoid();

                    const transaction = {
                        transactionId:uniqueID,
                        transactionType:'Credit',
                        description:'Product Ordered',
                        amount:orderSucess.totalAmount,
                        orderId:orderSucess._id
                    }

                    const returnAmount = await userData.updateOne({_id:userId},{ $inc: { walletAmount: -orderSucess.totalAmount } },{ upsert: true });
                    const updateWalletTransaction = await userData.updateOne({_id:userId},{ $push: { walletTransaction: transaction } },{ upsert: true });

                    const updatePaymentStatus = await orderData.updateOne({_id:orderSucess._id},{$set:{paymentStatus:'Paid'}});

                    if(returnAmount && updateWalletTransaction && updatePaymentStatus){
                        res.json({walletPayment:true,orderId:orderSucess._id});
                    }else{
                        res.json({failed:true});
                    }

                }

            }else{
                res.json({failed:true});
            }
        }else{

            let stockUpdate;
            for(let item of products){
                const filter = {_id:item.productId}
                const update = {$inc:{stock:-item.productquantity}};

                stockUpdate = await productInfo.updateOne(filter,update);
            }

            const deleteCart = await cartData.deleteOne({userId:userId});
            const userCartId = await userData.updateOne({_id:userId},{ $unset: { cartProducts: 1 } });
            
            if(stockUpdate && deleteCart && userCartId){

                if(orderSucess.paymentMethod == 'COD'){
                    res.json({CODSuccess:true,orderId:orderSucess._id});
                }
                else if(orderSucess.paymentMethod == 'OnlinePayment'){

                    var options = {
                        amount: orderSucess.totalAmount * 100 ,  // amount in the smallest currency unit
                        currency: "INR",
                        receipt: orderSucess._id
                      };
                      instance.orders.create(options, function(err, order) {
                            res.json({OnlinePayment:true,order:order})
                      });

                }else if(orderSucess.paymentMethod == 'Wallet'){
                    
                    const nanoidModule = await import('nanoid');
                    nanoid = nanoidModule.nanoid;

                    const uniqueID = nanoid();

                    const transaction = {
                        transactionId:uniqueID,
                        transactionType:'Credit',
                        description:'Product Ordered',
                        amount:orderSucess.totalAmount,
                        orderId:orderSucess._id
                    }

                    const returnAmount = await userData.updateOne({_id:userId},{ $inc: { walletAmount: -orderSucess.totalAmount } },{ upsert: true });
                    const updateWalletTransaction = await userData.updateOne({_id:userId},{ $push: { walletTransaction: transaction } },{ upsert: true });

                    const updatePaymentStatus = await orderData.updateOne({_id:orderSucess._id},{$set:{paymentStatus:'Paid'}});

                    if(returnAmount && updateWalletTransaction && updatePaymentStatus){
                        res.json({walletPayment:true,orderId:orderSucess._id});
                    }else{
                        res.json({failed:true});
                    }

                }

            }else{
                res.json({status:false});
            }
        }
        // **** End Of The Stock Management ****


    } catch (error) {
        next(error);
    }
}


// PAYMENT VERIFICATION IN RAZORPAY
const paymentVerification  = async(req,res) => {
    
    const payment = req.body.Payment;
    const order = req.body.orderReceipt;
    console.log(req.body)
    let hmac = crypto.createHmac('sha256', process.env.PAYMENT_INTEGRATION_KEY_SECRET);
    hmac.update(payment.razorpay_order_id+"|"+payment.razorpay_payment_id);
    hmac = hmac.digest('hex');
    if(hmac == payment.razorpay_signature){

        const updatePaymentStatus = await orderData.updateOne({_id:order.receipt},{$set:{paymentStatus:'Paid'}});
        res.json({onlinePaymentStaus:true,orderId:order.receipt});

    }else{
        console.log('failed')
    }
}



const loadOrderSucess = async(req, res, next)=>{
    try {
        const checkLogin = req.session.userId ? true : false;

        const orderId = req.query.orderId;
        const orderDetails = await orderData.findOne({_id:orderId}).populate('productInforamtion.productId');

        if(orderDetails){
            res.render('user/orderPlacedSucess',{user:true, title:'CheckOut', login:checkLogin, order:orderDetails});
        }else{
            throw new Error('Data Not Found');
        }
    } catch (error) {
        next(error)
    }
}



// ######### Function in Checkout Controller Stock Check ######
async function checkStock(userId){
    const cartItems = await cartData.aggregate([
        {
            $match:{
                userId: new mongoose.Types.ObjectId(userId)
            }
        },
        {
            $unwind:'$cartProducts'
        },
        {
            $lookup:{
                from:'products',
                localField:'cartProducts.productId',
                foreignField:'_id',
                as:'productData'
            }
        }
    ]);

    let checkStock = true;
    cartItems.forEach(products => {
        console.log(products.productData[0].stock,products.cartProducts.quantity)
        if(products.cartProducts.quantity > products.productData[0].stock){
            checkStock = false;
        }
    });

    return checkStock;
}



module.exports = {
    LoadCheckoutPage,
    PlaceOrder,
    paymentVerification,
    loadOrderSucess
}