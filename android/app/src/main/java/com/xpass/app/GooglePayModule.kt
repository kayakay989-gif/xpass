package com.xpass.app

import android.app.Activity
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.wallet.*
import org.json.JSONObject

/**
 * React Native module for Google Pay integration
 * Handles Google Pay SDK initialization and payment requests
 */
class GooglePayModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var paymentsClient: PaymentsClient? = null

    init {
        // Initialize Google Pay client
        val walletOptions = Wallet.WalletOptions.Builder()
            .setEnvironment(WalletConstants.ENVIRONMENT_TEST) // Use ENVIRONMENT_PRODUCTION for production
            .build()

        paymentsClient = Wallet.getPaymentsClient(reactContext, walletOptions)
    }

    override fun getName(): String {
        return "GooglePayModule"
    }

    /**
     * Check if Google Pay is ready to pay
     */
    @ReactMethod
    fun isReadyToPay(promise: Promise) {
        val paymentsClient = this.paymentsClient ?: run {
            promise.reject("GOOGLE_PAY_ERROR", "PaymentsClient not initialized")
            return
        }

        val request = IsReadyToPayRequest.fromJson(
            """
            {
                "apiVersion": 2,
                "apiVersionMinor": 0,
                "allowedPaymentMethods": [
                    {
                        "type": "CARD",
                        "parameters": {
                            "allowedAuthMethods": ["PAN_ONLY", "CRYPTOGRAM_3DS"],
                            "allowedCardNetworks": ["VISA", "MASTERCARD"]
                        }
                    }
                ]
            }
            """.trimIndent()
        )

        paymentsClient.isReadyToPay(request)
            .addOnCompleteListener { task ->
                if (task.isSuccessful) {
                    promise.resolve(task.result)
                } else {
                    promise.reject("GOOGLE_PAY_ERROR", "Failed to check Google Pay availability", task.exception)
                }
            }
    }

    /**
     * Request Google Pay payment
     */
    @ReactMethod
    fun requestPayment(config: ReadableMap, promise: Promise) {
        val paymentsClient = this.paymentsClient ?: run {
            promise.reject("GOOGLE_PAY_ERROR", "PaymentsClient not initialized")
            return
        }

        val activity = currentActivity ?: run {
            promise.reject("GOOGLE_PAY_ERROR", "Activity not available")
            return
        }

        try {
            // Extract configuration
            val merchantName = config.getString("merchantName") ?: "XPASS"
            val merchantId = config.getString("merchantId") ?: ""
            val gateway = config.getString("gateway") ?: "mastercard"
            val gatewayMerchantId = config.getString("gatewayMerchantId") ?: ""
            val allowedNetworks = config.getArray("allowedNetworks")?.toArrayList() as? List<String> ?: listOf("VISA", "MASTERCARD")
            val currency = config.getString("currency") ?: "JOD"
            val country = config.getString("country") ?: "JO"
            val totalPrice = config.getString("totalPrice") ?: "0.00"

            // Create payment data request JSON
            val paymentDataRequestJson = JSONObject().apply {
                put("apiVersion", 2)
                put("apiVersionMinor", 0)
                put("merchantInfo", JSONObject().apply {
                    put("merchantName", merchantName)
                    if (merchantId.isNotEmpty()) {
                        put("merchantId", merchantId)
                    }
                })
                put("allowedPaymentMethods", org.json.JSONArray().apply {
                    put(JSONObject().apply {
                        put("type", "CARD")
                        put("parameters", JSONObject().apply {
                            put("allowedAuthMethods", org.json.JSONArray().apply {
                                put("PAN_ONLY")
                                put("CRYPTOGRAM_3DS")
                            })
                            put("allowedCardNetworks", org.json.JSONArray().apply {
                                allowedNetworks.forEach { network ->
                                    put(network)
                                }
                            })
                        })
                        put("tokenizationSpecification", JSONObject().apply {
                            put("type", "PAYMENT_GATEWAY")
                            put("parameters", JSONObject().apply {
                                put("gateway", gateway)
                                put("gatewayMerchantId", gatewayMerchantId)
                            })
                        })
                    })
                })
                put("transactionInfo", JSONObject().apply {
                    put("totalPriceStatus", "FINAL")
                    put("totalPrice", totalPrice)
                    put("currencyCode", currency)
                    put("countryCode", country)
                })
            }.toString()

            val request = PaymentDataRequest.fromJson(paymentDataRequestJson)

            // Launch Google Pay
            val task = paymentsClient.loadPaymentData(request)
            task.addOnCompleteListener { completedTask ->
                if (completedTask.isSuccessful) {
                    val paymentData = completedTask.result
                    val paymentDataJson = JSONObject(paymentData.toJson())
                    
                    // Extract token
                    val token = paymentDataJson
                        .getJSONObject("paymentMethodData")
                        .getJSONObject("tokenizationData")
                        .getString("token")

                    // Return payment data as WritableMap
                    val result = Arguments.createMap().apply {
                        putMap("paymentMethodData", Arguments.createMap().apply {
                            putMap("tokenizationData", Arguments.createMap().apply {
                                putString("token", token)
                            })
                        })
                    }

                    promise.resolve(result)
                } else {
                    val exception = completedTask.exception
                    if (exception is ResolvableApiException) {
                        // User cancelled or needs to set up Google Pay
                        promise.reject("GOOGLE_PAY_CANCELLED", "Google Pay payment was cancelled or not available", exception)
                    } else {
                        promise.reject("GOOGLE_PAY_ERROR", "Google Pay payment failed", exception)
                    }
                }
            }
        } catch (e: Exception) {
            promise.reject("GOOGLE_PAY_ERROR", "Failed to create payment request: ${e.message}", e)
        }
    }
}
