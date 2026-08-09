package com.xpass.unique

import android.view.View
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.android.gms.wallet.button.ButtonConstants
import com.google.android.gms.wallet.button.ButtonOptions
import com.google.android.gms.wallet.button.PayButton

/**
 * Official Google Pay PayButton (required by Google Pay brand guidelines).
 * @see https://developers.google.com/pay/api/android/guides/brand-guidelines
 */
class GooglePayButtonManager(private val reactContext: ReactApplicationContext) :
    SimpleViewManager<GooglePayButtonWrapper>() {

    override fun getName(): String = "GooglePayButton"

    private var theme = ButtonConstants.ButtonTheme.DARK
    private var type = ButtonConstants.ButtonType.PAY
    private var cornerRadius = 24
    private var allowedPaymentMethods = "[]"
    private var enabled = true

    override fun createViewInstance(reactContext: ThemedReactContext): GooglePayButtonWrapper {
        val wrapper = GooglePayButtonWrapper(reactContext)
        wrapper.payButton.setOnClickListener {
            if (!enabled) return@setOnClickListener
            val event = Arguments.createMap()
            reactContext
                .getJSModule(RCTEventEmitter::class.java)
                .receiveEvent(wrapper.id, "topPress", event)
        }
        rebuildButton(wrapper)
        return wrapper
    }

    @ReactProp(name = "theme")
    fun setTheme(view: GooglePayButtonWrapper, themeName: String?) {
        theme = when (themeName?.lowercase()) {
            "light" -> ButtonConstants.ButtonTheme.LIGHT
            else -> ButtonConstants.ButtonTheme.DARK
        }
        rebuildButton(view)
    }

    @ReactProp(name = "buttonType")
    fun setButtonType(view: GooglePayButtonWrapper, typeName: String?) {
        type = when (typeName?.lowercase()) {
            "buy" -> ButtonConstants.ButtonType.BUY
            "checkout" -> ButtonConstants.ButtonType.CHECKOUT
            "order" -> ButtonConstants.ButtonType.ORDER
            "plain" -> ButtonConstants.ButtonType.PLAIN
            else -> ButtonConstants.ButtonType.PAY
        }
        rebuildButton(view)
    }

    @ReactProp(name = "cornerRadius", defaultInt = 24)
    fun setCornerRadius(view: GooglePayButtonWrapper, radius: Int) {
        cornerRadius = radius.coerceAtLeast(0)
        rebuildButton(view)
    }

    @ReactProp(name = "allowedPaymentMethods")
    fun setAllowedPaymentMethods(view: GooglePayButtonWrapper, json: String?) {
        allowedPaymentMethods = json?.takeIf { it.isNotBlank() } ?: "[]"
        rebuildButton(view)
    }

    @ReactProp(name = "enabled", defaultBoolean = true)
    fun setEnabled(view: GooglePayButtonWrapper, isEnabled: Boolean) {
        enabled = isEnabled
        view.payButton.isEnabled = isEnabled
        view.payButton.alpha = if (isEnabled) 1f else 0.55f
    }

    private fun rebuildButton(wrapper: GooglePayButtonWrapper) {
        wrapper.payButton.initialize(
            ButtonOptions.newBuilder()
                .setButtonTheme(theme)
                .setButtonType(type)
                .setCornerRadius(cornerRadius)
                .setAllowedPaymentMethods(allowedPaymentMethods)
                .build()
        )
        wrapper.payButton.isEnabled = enabled
        wrapper.payButton.alpha = if (enabled) 1f else 0.55f
        wrapper.requestLayoutFix()
    }

    override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any>? =
        MapBuilder.builder<String, Any>()
            .put("topPress", MapBuilder.of("registrationName", "onPress"))
            .build()
}

/** Wrapper fixes PayButton layout/measure issues inside React Native. */
class GooglePayButtonWrapper(context: ThemedReactContext) : FrameLayout(context) {
    val payButton: PayButton = PayButton(context)

    init {
        addView(
            payButton,
            LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT)
        )
    }

    private val measureAndLayout = Runnable {
        measure(
            MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
        )
        layout(left, top, right, bottom)
    }

    fun requestLayoutFix() {
        post(measureAndLayout)
    }

    override fun requestLayout() {
        super.requestLayout()
        post(measureAndLayout)
    }
}
