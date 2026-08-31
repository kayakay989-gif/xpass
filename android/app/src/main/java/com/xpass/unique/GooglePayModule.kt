package com.xpass.unique

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ActivityEventListener
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.wallet.AutoResolveHelper
import com.google.android.gms.wallet.IsReadyToPayRequest
import com.google.android.gms.wallet.PaymentData
import com.google.android.gms.wallet.PaymentDataRequest
import com.google.android.gms.wallet.PaymentsClient
import com.google.android.gms.wallet.Wallet
import com.google.android.gms.wallet.WalletConstants
import org.json.JSONArray
import org.json.JSONObject
import com.facebook.react.bridge.ReadableType
import java.util.Locale

/**
 * Native Google Pay module bridging the Google Pay API to React Native.
 * Returns the gateway tokenization token (MPGS) which the backend charges via
 * payments.payWithWallet. PAN data never touches JS.
 */
class GooglePayModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var paymentPromise: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "GooglePayModule"

    /** PRODUCTION after Google Pay Console approval; TEST only for local sandbox. */
    private fun environment(): Int =
        if (BuildConfig.GOOGLE_PAY_ENVIRONMENT.equals("TEST", ignoreCase = true)) {
            WalletConstants.ENVIRONMENT_TEST
        } else {
            WalletConstants.ENVIRONMENT_PRODUCTION
        }

    private fun paymentsClient(activity: Activity): PaymentsClient {
        val options = Wallet.WalletOptions.Builder()
            .setEnvironment(environment())
            .build()
        return Wallet.getPaymentsClient(activity, options)
    }

    private fun readTotalPrice(config: ReadableMap): String {
        if (!config.hasKey("totalPrice") || config.isNull("totalPrice")) return "0.00"
        val raw = try {
            when (config.getType("totalPrice")) {
                ReadableType.Number -> config.getDouble("totalPrice")
                ReadableType.String -> config.getString("totalPrice")?.trim()?.toDoubleOrNull() ?: 0.0
                else -> 0.0
            }
        } catch (_: Exception) {
            0.0
        }
        // Google Pay PaymentDataRequest.totalPrice must match ^[0-9]+(\.[0-9][0-9])?$
        // Three decimals (JOD fils) cause ERROR_CODE_DEVELOPER_ERROR (10). MPGS still
        // receives the 3-decimal amount from the backend charge, not this sheet value.
        return String.format(Locale.US, "%.2f", raw)
    }

    private fun allowedNetworksJson(allowedNetworks: ReadableArray?): JSONArray {
        val networks = JSONArray()
        if (allowedNetworks != null && allowedNetworks.size() > 0) {
            for (i in 0 until allowedNetworks.size()) {
                allowedNetworks.getString(i)?.let { networks.put(it.uppercase()) }
            }
        } else {
            networks.put("VISA")
            networks.put("MASTERCARD")
        }
        return networks
    }

    private fun baseCardPaymentMethod(allowedNetworks: ReadableArray?): JSONObject {
        val params = JSONObject()
            .put("allowedAuthMethods", JSONArray().put("PAN_ONLY").put("CRYPTOGRAM_3DS"))
            .put("allowedCardNetworks", allowedNetworksJson(allowedNetworks))
        return JSONObject()
            .put("type", "CARD")
            .put("parameters", params)
    }

    @ReactMethod
    fun isReadyToPay(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.resolve(false)
            return
        }
        try {
            val request = JSONObject()
                .put("apiVersion", 2)
                .put("apiVersionMinor", 0)
                .put("allowedPaymentMethods", JSONArray().put(baseCardPaymentMethod(null)))
            val req = IsReadyToPayRequest.fromJson(request.toString())
            paymentsClient(activity).isReadyToPay(req).addOnCompleteListener { task ->
                try {
                    promise.resolve(task.getResult(ApiException::class.java) == true)
                } catch (e: Exception) {
                    promise.resolve(false)
                }
            }
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestPayment(config: ReadableMap, promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No current activity available for Google Pay")
            return
        }
        paymentPromise = promise
        try {
            val gatewayRaw = if (config.hasKey("gateway")) config.getString("gateway") else null
            val gateway = when {
                gatewayRaw.isNullOrBlank() -> "mpgs"
                gatewayRaw.equals("mastercard", ignoreCase = true) -> "mpgs"
                else -> gatewayRaw
            }
            val gatewayMerchantId =
                if (config.hasKey("gatewayMerchantId")) config.getString("gatewayMerchantId") else null
            val merchantName = if (config.hasKey("merchantName")) config.getString("merchantName") else "Xpass"
            val merchantId = if (config.hasKey("merchantId")) config.getString("merchantId") else null
            val currency = if (config.hasKey("currency")) config.getString("currency") else "JOD"
            val country = if (config.hasKey("country")) config.getString("country") else "JO"
            val totalPrice = readTotalPrice(config)
            val allowedNetworks = if (config.hasKey("allowedNetworks")) config.getArray("allowedNetworks") else null

            val cardMethod = baseCardPaymentMethod(allowedNetworks)
            cardMethod.put(
                "tokenizationSpecification",
                JSONObject()
                    .put("type", "PAYMENT_GATEWAY")
                    .put(
                        "parameters",
                        JSONObject()
                            .put("gateway", gateway)
                            .put("gatewayMerchantId", gatewayMerchantId ?: "")
                    )
            )

            val merchantInfo = JSONObject().put("merchantName", merchantName ?: "Xpass")
            if (!merchantId.isNullOrEmpty()) {
                merchantInfo.put("merchantId", merchantId)
            }

            val paymentDataRequestJson = JSONObject()
                .put("apiVersion", 2)
                .put("apiVersionMinor", 0)
                .put("allowedPaymentMethods", JSONArray().put(cardMethod))
                .put("merchantInfo", merchantInfo)
                .put(
                    "transactionInfo",
                    JSONObject()
                        .put("totalPrice", totalPrice)
                        .put("totalPriceStatus", "FINAL")
                        .put("currencyCode", (currency ?: "JOD").uppercase(Locale.US))
                        .put("countryCode", (country ?: "JO").uppercase(Locale.US))
                )

            val request = PaymentDataRequest.fromJson(paymentDataRequestJson.toString())
            AutoResolveHelper.resolveTask(
                paymentsClient(activity).loadPaymentData(request),
                activity,
                LOAD_PAYMENT_DATA_REQUEST_CODE
            )
        } catch (e: Exception) {
            paymentPromise?.reject("GPAY_ERROR", e.message, e)
            paymentPromise = null
        }
    }

    override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?
    ) {
        if (requestCode != LOAD_PAYMENT_DATA_REQUEST_CODE) return
        val promise = paymentPromise ?: return

        when (resultCode) {
            Activity.RESULT_OK -> {
                val paymentData = data?.let { PaymentData.getFromIntent(it) }
                val json = paymentData?.toJson()
                if (json == null) {
                    promise.reject("NO_DATA", "Google Pay returned no payment data")
                } else {
                    try {
                        val token = JSONObject(json)
                            .getJSONObject("paymentMethodData")
                            .getJSONObject("tokenizationData")
                            .getString("token")
                        val result = Arguments.createMap()
                        result.putString("paymentToken", token)
                        promise.resolve(result)
                    } catch (e: Exception) {
                        promise.reject("PARSE_ERROR", e.message, e)
                    }
                }
            }
            Activity.RESULT_CANCELED -> {
                val result = Arguments.createMap()
                result.putBoolean("canceled", true)
                promise.resolve(result)
            }
            AutoResolveHelper.RESULT_ERROR -> {
                val status = AutoResolveHelper.getStatusFromIntent(data)
                val code = status?.statusCode
                val detail = status?.statusMessage?.takeIf { it.isNotBlank() }
                val message = when (code) {
                    WalletConstants.ERROR_CODE_MERCHANT_ACCOUNT_ERROR -> buildString {
                        append(
                            "Google Pay merchant account is not configured for this app build. "
                        )
                        append(
                            "In Google Pay & Wallet Console, register package com.xpass.unique with the Play/App signing SHA-1 fingerprint and ensure production access is approved."
                        )
                        if (detail != null) append(" ($detail)")
                    }
                    6 -> "Google Pay merchant is not configured for this app. Ensure your MPGS merchant is linked in Google Pay Console."
                    else -> buildString {
                        append("Google Pay error (code $code)")
                        if (detail != null) append(": $detail")
                    }
                }
                promise.reject("GPAY_ERROR", message)
            }
            else -> {
                promise.reject("GPAY_ERROR", "Google Pay failed with resultCode $resultCode")
            }
        }
        paymentPromise = null
    }

    override fun onNewIntent(intent: Intent) {}

    companion object {
        private const val LOAD_PAYMENT_DATA_REQUEST_CODE = 991
    }
}
