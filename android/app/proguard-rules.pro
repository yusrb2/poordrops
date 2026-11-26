# ProGuard rules for PoorDrops (Capacitor Android)
-keep class com.getcapacitor.** { *; }
-keep class com.poordrops.app.** { *; }

-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
