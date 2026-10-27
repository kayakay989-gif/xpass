# Release R8 rules.
# Play's DEX requirement is a minimum of 25% obfuscation, optimization, and
# shrinking. Library AARs already ship their own keep rules. This file only
# keeps reflection entry points so Google Pay, Firebase, and React Native
# still run, and R8 can rename the rest.

# react-native-reanimated / new architecture
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native looks native methods and @ReactMethod up by name.
-keepclasseswithmembernames class * {
    native <methods>;
}
-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp *;
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}

# This app's native modules (Google Pay package, button, activity).
-keep class com.xpass.unique.** { *; }

# RNFirebase loads its modules by reflection.
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.**

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

-dontwarn com.facebook.react.**
-dontwarn com.google.android.gms.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn kotlin.**
-dontwarn kotlinx.**
